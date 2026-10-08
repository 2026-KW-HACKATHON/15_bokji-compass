"""Bounded, read-only HTTP load test of the existing public catalog.

Run from any directory; see scripts/readme.md for inputs and result fields.
No accounts, external AI, attachments, or data mutation are exercised.
"""

import argparse
import asyncio
import ctypes
import json
import math
import os
import random
import statistics
import time
from collections import Counter, defaultdict, deque
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote, urlsplit

import httpx


def percentile(values, fraction):
    ordered = sorted(values)
    return ordered[max(0, math.ceil(len(ordered) * fraction) - 1)] if ordered else None


def summary(records, elapsed):
    times = [row[1] for row in records]
    successful_times = [row[1] for row in records if row[2] == "200"]
    errors = sum(row[2] != "200" for row in records)
    return {
        "requests": len(records),
        "errors": errors,
        "error_percent": round(100 * errors / len(records), 2) if records else 0,
        "status_counts": dict(Counter(row[2] for row in records)),
        "requests_per_second": round(len(records) / elapsed, 2),
        "successes_per_second": round((len(records) - errors) / elapsed, 2),
        "latency_ms": {
            "mean": round(statistics.mean(times), 1) if times else None,
            "p50": percentile(times, 0.50),
            "p95": percentile(times, 0.95),
            "p99": percentile(times, 0.99),
            "max": max(times) if times else None,
            "successful_p95": percentile(successful_times, 0.95),
        },
    }


class ResourceMonitor:
    """Optional Windows process counters, without third-party dependencies."""

    def __init__(self, pids):
        self.pids = {**pids, "generator": os.getpid()}
        self.previous = {}
        self.handles = {}
        self.cpu_count = os.cpu_count() or 1
        if os.name == "nt":
            from ctypes import wintypes

            self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
            self.psapi = ctypes.WinDLL("psapi", use_last_error=True)
            self.kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            self.kernel.OpenProcess.restype = wintypes.HANDLE
            self.kernel.GetProcessTimes.argtypes = [wintypes.HANDLE] + [
                ctypes.POINTER(wintypes.FILETIME)
            ] * 4
            self.kernel.GetSystemTimes.argtypes = [ctypes.POINTER(wintypes.FILETIME)] * 3
            self.kernel.CloseHandle.argtypes = [wintypes.HANDLE]

            class MemoryCounters(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            self.memory_type = MemoryCounters
            self.psapi.GetProcessMemoryInfo.argtypes = [
                wintypes.HANDLE, ctypes.POINTER(MemoryCounters), wintypes.DWORD,
            ]
            self.filetime = wintypes.FILETIME
            for label, pid in self.pids.items():
                handle = self.kernel.OpenProcess(0x0400 | 0x0010, False, pid)
                if handle:
                    self.handles[label] = handle

    @staticmethod
    def ticks(value):
        return ((value.dwHighDateTime << 32) | value.dwLowDateTime) / 10_000_000

    def sample(self):
        if os.name != "nt":
            return {}
        now, result = time.perf_counter(), {}
        idle, kernel, user = self.filetime(), self.filetime(), self.filetime()
        if self.kernel.GetSystemTimes(ctypes.byref(idle), ctypes.byref(kernel),
                                      ctypes.byref(user)):
            total, idle_time = self.ticks(kernel) + self.ticks(user), self.ticks(idle)
            previous = self.previous.get("host")
            if previous and total > previous[0]:
                result["host_cpu_percent"] = round(
                    100 * (1 - (idle_time - previous[1]) / (total - previous[0])), 1
                )
            self.previous["host"] = total, idle_time
        for label, handle in self.handles.items():
            created, exited, kernel, user = (self.filetime() for _ in range(4))
            values = {}
            if self.kernel.GetProcessTimes(handle, ctypes.byref(created), ctypes.byref(exited),
                                           ctypes.byref(kernel), ctypes.byref(user)):
                cpu = self.ticks(kernel) + self.ticks(user)
                previous = self.previous.get(label)
                if previous:
                    values["cpu_one_core_percent"] = round(
                        100 * (cpu - previous[1]) / (now - previous[0]), 1
                    )
                self.previous[label] = now, cpu
            memory = self.memory_type()
            memory.cb = ctypes.sizeof(memory)
            if self.psapi.GetProcessMemoryInfo(handle, ctypes.byref(memory), memory.cb):
                values["working_set_mib"] = round(memory.WorkingSetSize / 1024**2, 1)
            result[label] = values
        return result

    def close(self):
        if os.name == "nt":
            for handle in self.handles.values():
                self.kernel.CloseHandle(handle)


def valid_response(response, label):
    if response.status_code != 200:
        return str(response.status_code)
    if label == "homepage":
        return "200" if "<html" in response.text.lower() else "invalid_body"
    try:
        payload = response.json()
        if label in {"list", "search"}:
            valid = isinstance(payload.get("items"), list) and "total" in payload
        elif label == "detail":
            valid = "revisionId" in payload and "id" in payload
        elif label == "options":
            valid = isinstance(payload, dict) and bool(payload)
        else:
            valid = False
        return "200" if valid else "invalid_body"
    except (ValueError, AttributeError):
        return "invalid_body"


async def run(args):
    headers = {"User-Agent": "BokjiCompass-ReadOnly-LoadTest/1.0"}
    if urlsplit(args.base_url).hostname in {"127.0.0.1", "localhost", "::1"}:
        # Reproduce the trusted loopback proxy's HTTPS scheme for production APIs.
        headers["X-Forwarded-Proto"] = "https"
    limits = httpx.Limits(max_connections=max(args.users) + 2,
                         max_keepalive_connections=max(args.users) + 2)
    monitor = ResourceMonitor(dict(args.pid))
    report = {
        "started_at_utc": datetime.now(UTC).isoformat(),
        "configuration": {k: v for k, v in vars(args).items() if k != "pid"},
        "process_ids": monitor.pids,
        "model": "closed-loop: each virtual user sends one request, then waits",
        "stages": [],
    }

    def save():
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        async with httpx.AsyncClient(base_url=args.base_url, headers=headers, limits=limits,
                                     timeout=args.timeout, trust_env=False) as client:
            prefix = args.api_prefix.rstrip("/")
            baseline = await client.get(prefix + "/v1/policies", params={"limit": 20})
            baseline.raise_for_status()
            items = baseline.json()["items"]
            if not items:
                raise RuntimeError("No published policies to test")
            report["published_policy_total"] = baseline.json().get("total")
            queries = ["청년", "장학금", "노원구 지원금", "주거 지원"]
            if args.search_set == "varied":
                queries += [f"{region} {topic}" for region in ["서울", "노원구", "경기", "전국"]
                            for topic in ["청년 지원", "장학금", "주거 지원", "의료비 지원",
                                          "취업 지원", "장애인 지원", "교통비 지원", "돌봄 지원"]]
            paths = {
                "homepage": ["/"],
                "list": [prefix + "/v1/policies?limit=20&sort=" + sort
                         for sort in ["recent", "popular", "name"]],
                "search": [str(httpx.URL(prefix + "/v1/policies").copy_merge_params(
                    {"limit": 20, "q": query, "search_mode": "smart"}))
                    for query in queries],
                "detail": [prefix + "/v1/policies/" + quote(item["id"], safe="")
                           for item in items],
                "options": [prefix + "/v1/policies/options"],
            }
            labels = ["homepage"] if args.scenario == "static" else [
                "list", "search", "detail", "list", "search",
                "detail", "options", "list", "search", "detail",
            ]
            report["request_mix"] = dict(Counter(labels))
            report["baseline"] = []
            for label in sorted(set(labels)):
                started = time.perf_counter()
                response = await client.get(paths[label][0])
                code = valid_response(response, label)
                report["baseline"].append({"endpoint": label, "status": code,
                    "latency_ms": round((time.perf_counter() - started) * 1000, 1)})
                if code != "200":
                    raise RuntimeError(f"Baseline {label} failed: {code}")
            save()
            print(json.dumps({"baseline": report["baseline"],
                              "total": report["published_policy_total"]}), flush=True)

            total_requests = 0
            for users in args.users:
                stage_start = time.perf_counter()
                deadline = stage_start + args.seconds
                stopped = asyncio.Event()
                records, resources, health = [], [], []
                recent = deque(maxlen=20)
                circuit_reason = None

                async def virtual_user(index):
                    nonlocal total_requests, circuit_reason
                    rng = random.Random(20261009 + index)
                    sequence = index
                    # Spread the arrivals over a second to avoid a synchronized burst.
                    await asyncio.sleep(rng.uniform(0, min(1, args.think_seconds)))
                    while time.perf_counter() < deadline and not stopped.is_set():
                        if total_requests >= args.max_requests:
                            circuit_reason = "request_budget_reached"
                            stopped.set()
                            break
                        total_requests += 1
                        label = labels[sequence % len(labels)]
                        sequence += 1
                        path = rng.choice(paths[label])
                        started = time.perf_counter()
                        try:
                            response = await client.get(path)
                            code = valid_response(response, label)
                            size = len(response.content)
                        except httpx.HTTPError as error:
                            code, size = type(error).__name__, 0
                        records.append((label, round((time.perf_counter() - started) * 1000, 1),
                                        code, size))
                        recent.append(code)
                        if len(recent) == 20 and sum(c != "200" for c in recent) >= 5:
                            circuit_reason = "at_least_25_percent_errors_in_last_20_requests"
                            stopped.set()
                        remaining = deadline - time.perf_counter()
                        if remaining > 0 and not stopped.is_set():
                            await asyncio.sleep(min(remaining, args.think_seconds
                                                    * rng.uniform(0.75, 1.25)))

                async def sample():
                    nonlocal circuit_reason
                    failed_probes = 0
                    while not stopped.is_set():
                        resources.append(monitor.sample())
                        if len(resources) % 5 == 1:
                            started = time.perf_counter()
                            try:
                                response = await client.get(prefix + "/health/ready", timeout=3)
                                code = str(response.status_code)
                            except httpx.HTTPError as error:
                                code = type(error).__name__
                            health.append({"status": code, "latency_ms": round(
                                (time.perf_counter() - started) * 1000, 1)})
                            failed_probes = failed_probes + 1 if code != "200" else 0
                            if failed_probes >= 2:
                                circuit_reason = "two_consecutive_failed_readiness_probes"
                                stopped.set()
                        try:
                            await asyncio.wait_for(stopped.wait(), timeout=1)
                        except TimeoutError:
                            pass

                sampler = asyncio.create_task(sample())
                await asyncio.gather(*(virtual_user(index) for index in range(users)))
                stopped.set()
                await sampler
                elapsed = time.perf_counter() - stage_start
                grouped = defaultdict(list)
                for row in records:
                    grouped[row[0]].append(row)
                stage = {
                    "virtual_users": users,
                    "elapsed_seconds": round(elapsed, 2),
                    **summary(records, elapsed),
                    "by_endpoint": {label: summary(rows, elapsed)
                                    for label, rows in grouped.items()},
                    "health_probes": health,
                    "resources": resources,
                    "circuit_reason": circuit_reason,
                }
                stage["meets_target"] = bool(records) and (
                    stage["latency_ms"]["p95"] <= args.target_p95_ms
                    and stage["error_percent"] < 1
                    and all(probe["status"] == "200" for probe in health)
                )
                report["stages"].append(stage)
                save()
                print(json.dumps({k: v for k, v in stage.items()
                                  if k not in {"resources", "by_endpoint", "health_probes"}}),
                      flush=True)
                if (circuit_reason or stage["error_percent"] >= 2
                        or (stage["latency_ms"]["p95"] or 0) > args.stop_p95_ms):
                    report["stop_reason"] = circuit_reason or "stage_latency_or_error_limit"
                    break
                await asyncio.sleep(3)
            report["finished_at_utc"] = datetime.now(UTC).isoformat()
            save()
    finally:
        monitor.close()


def process_argument(value):
    label, pid = value.split("=", 1)
    return label, int(pid)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--api-prefix", default="/api")
    parser.add_argument("--scenario", choices=["browse", "static"], default="browse")
    parser.add_argument("--search-set", choices=["standard", "varied"], default="standard")
    parser.add_argument("--users", type=int, nargs="+", default=[1, 5, 10, 20, 40, 80, 120])
    parser.add_argument("--seconds", type=float, default=30)
    parser.add_argument("--think-seconds", type=float, default=2)
    parser.add_argument("--timeout", type=float, default=8)
    parser.add_argument("--target-p95-ms", type=float, default=2000)
    parser.add_argument("--stop-p95-ms", type=float, default=5000)
    parser.add_argument("--max-requests", type=int, default=4000)
    parser.add_argument("--pid", type=process_argument, action="append", default=[])
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if (not args.users or len(args.users) > 10 or min(args.users) < 1 or max(args.users) > 200
            or not 5 <= args.seconds <= 60 or not 0 <= args.think_seconds <= 30
            or not 1 <= args.timeout <= 15 or not 1 <= args.max_requests <= 5000):
        parser.error("Bounds: up to 10 stages, users 1..200, seconds 5..60, think 0..30, "
                     "timeout 1..15, max-requests 1..5000")
    parsed = urlsplit(args.base_url)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        parser.error("base-url must be an HTTP(S) origin without credentials")
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
