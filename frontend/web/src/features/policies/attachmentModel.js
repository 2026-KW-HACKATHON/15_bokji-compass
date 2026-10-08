import { safeWebUrl } from '../../../../packages/core/src/safeUrl.js';

export function parseAttachments(value, policyId) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.slice(0, 32).flatMap((item) => {
    if (!item || !/^[a-f0-9]{64}$/.test(item.id) || seen.has(item.id)) return [];
    const path = `/v1/policies/${encodeURIComponent(policyId)}/attachments/${item.id}`;
    if (
      typeof item.name !== 'string' ||
      !item.name.trim() ||
      item.name.length > 240 ||
      /[\u0000-\u001f\u007f]/.test(item.name) ||
      item.downloadUrl !== `${path}?download=true` ||
      (item.previewUrl !== null && item.previewUrl !== path)
    )
      return [];
    seen.add(item.id);
    return [
      {
        id: item.id,
        name: item.name,
        sourceUrl: safeWebUrl(item.sourceUrl),
        downloadUrl: item.downloadUrl,
        previewUrl: item.previewUrl,
        sizeBytes:
          Number.isSafeInteger(item.sizeBytes) && item.sizeBytes > 0 ? item.sizeBytes : null,
      },
    ];
  });
}

export function attachmentHref(path, apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/$/, '')}${path}`;
}
