"""2026 reference data, checked against official sources on 2026-09-25."""

RULES_VERSION = "2026.10.08-v2"
MEDIAN_2026 = (2_564_238, 4_199_292, 5_359_036, 6_494_738, 7_556_719, 8_555_952, 9_515_150)
REGIONAL_ALLOWANCES = {
    "seoul": (99_000_000, 172_000_000),
    "gyeonggi": (80_000_000, 151_000_000),
    "metropolitan": (77_000_000, 146_000_000),
    "other": (53_000_000, 112_000_000),
}
# Published 2026 national-rental 70% column, including the +20/+10 percentage
# points for one/two people. Do not derive these from the median-income table.
RENTAL_INCOME_LIMITS = (3_432_027, 4_693_016, 5_717_900, 6_161_541, 6_528_890, 6_934_384, 7_339_879)
RENTAL_ASSET_LIMIT = 345_000_000
RENTAL_VEHICLE_LIMIT = 45_420_000
SOURCES = [
    {
        "title": "보건복지부 · 2026 기준 중위소득",
        "url": "https://www.mohw.go.kr/menu.es?mid=a10708010900",
    },
    {
        "title": "보건복지부 · 기초생활보장 재산·소득 조사",
        "url": "https://www.mohw.go.kr/menu.es?mid=a10708010400",
    },
    {
        "title": "보건복지부 · 2026 국민기초생활보장사업안내 (법제처 제공)",
        "url": "https://www.easylaw.go.kr/CSP/FlDownload.laf?flSeq=1768437163027",
    },
    {
        "title": "마이홈 · 2026 국민임대 소득·자산 기준",
        "url": "https://www.myhome.go.kr/hws/portal/cont/selectNationalRentalHouseView.do",
    },
    {
        "title": "LH · 인천검단 AA19 국민임대 2026.08.20 공고 (차량 기준 7~8쪽)",
        "url": "https://apply.lh.or.kr/lhapply/lhFile.do?fileid=68228411",
    },
    {
        "title": "보건복지부 · 2026 차상위계층 확인사업 안내 (강남구 제공)",
        "url": "https://bokji.gangnam.go.kr/file/1/get/"
        "f94ec9b7-d067-499f-ad74-647e319456eb/download.do",
    },
]
