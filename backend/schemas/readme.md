# 조건 JSON Schema

`welfare-conditions-v2.schema.json`은 `app.contracts.conditions.CanonicalPolicy`에서 생성한 교환 계약.
권위 있는 검증기는 Pydantic 모델과 `validate_canonical`이며 JSON Schema만으로 공식 지역코드 존재·원문 인용을 검증할 수 없음.

backend 폴더의 가상환경 Python으로 갱신:

```python
import json
from pathlib import Path
from app.contracts.conditions import CanonicalPolicy

Path("schemas/welfare-conditions-v2.schema.json").write_text(
    json.dumps(CanonicalPolicy.model_json_schema(), ensure_ascii=False, indent=2) + "\n",
    encoding="utf-8",
)
```

테스트에서 생성 결과와 파일 일치 검증. 세부 의미·사용법은 [조건 및 지역 분류](../docs/condition-classification.md) 참조.
