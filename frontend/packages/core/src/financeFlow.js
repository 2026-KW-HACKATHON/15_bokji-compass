import {
  financeRegions,
  recipientTypes,
  deductionTypes,
  earnedIncomeBases,
  businessIncomeBases,
  vehicleOwnerships,
  vehicleRegistrationUses,
  vehicleUses,
  vehicleValueBases,
  vehicleKinds,
  vehicleSubsidies,
  parseInteger,
  parseMoney,
  MAX_MONEY,
  MAX_HOUSEHOLD_SIZE,
} from "./financeModel.js";

export const financeGroups = ["가구", "소득", "재산", "부채", "차량", "확인"];
export const fieldValue = (draft, path) =>
  path.split(".").reduce((value, key) => value?.[key], draft);
const amount = (path, id, label, hint) => ({
  path,
  id: `finance-${id}`,
  label,
  hint,
  type: "money",
});
const number = (path, id, label, unit, max, min = 0) => ({
  ...amount(path, id, label),
  type: "number",
  unit,
  max,
  min,
});
const select = (path, id, label, options, hint, when, required = false) => ({
  path,
  id: `finance-${id}`,
  label,
  options,
  hint,
  when,
  required,
  type: "select",
});
const check = (path, label) => ({
  path,
  id: `finance-${path}`,
  label,
  type: "check",
});
const positive = (path) => (draft) => {
  try {
    return parseMoney(fieldValue(draft, path), "금액") > 0;
  } catch {
    return false;
  }
};
const question = (id, group, title, fields, help) => ({
  id,
  group,
  title,
  fields,
  help,
});

// These describe the input flow only. Calculation rules remain on the server.
export function financeQuestions(draft) {
  return [
    question(
      "household",
      0,
      "어디에서, 몇 명이 함께 생활하나요?",
      [
        select(
          "region",
          "region",
          "거주 지역",
          financeRegions,
          draft.region === "jeonnam_gwangju"
            ? "전남광주통합특별시 안에서 실제 거주 권역을 선택하면 해당 권역 기준으로 계산해요."
            : "전남광주통합특별시에 거주하면 ‘전남광주통합특별시’를 선택하세요.",
        ),
        {
          ...select(
            "region_subdivision",
            "region-subdivision",
            "전남광주통합특별시 거주 권역",
            [
              ["gwangju", "광주광역시"],
              ["other", "그 외 지역"],
            ],
            "광주광역시는 다른 광역시 기준을, 그 외 지역은 그 밖의 지역 기준을 적용해요.",
            (profile) => profile.region === "jeonnam_gwangju",
          ),
          required: true,
        },
        {
          // Keep the native client's select contract; web renders countChoices before type.
          ...select(
            "household_size",
            "household",
            "가구원 수",
            Array.from({ length: 12 }, (_, i) => [i + 1, `${i + 1}명`]),
          ),
          min: 1,
          max: MAX_HOUSEHOLD_SIZE,
          countChoices: {
            groupFrom: 7,
            manualFrom: 12,
            allowUnknown: false,
            exactLabel: "실제 가구원 수",
          },
        },
      ],
      "household",
    ),
    question("household-details", 0, "가구에 해당하는 정보를 알려주세요", [
      {
        ...number(
          "minor_children",
          "children",
          "18세 미만 자녀 수",
          "명",
          Number(draft.household_size),
        ),
        countChoices: {
          groupFrom: 3,
          manualFrom: 9,
          exactLabel: "실제 자녀 수",
        },
      },
      select("recipient_status", "recipient", "지원 대상 구분", recipientTypes),
      {
        ...check(
          "household_scope_confirmed",
          "계산할 사업의 가구원 범위를 확인했어요",
        ),
        optional: true,
      },
      {
        ...check(
          "additional_review",
          "추가로 적용받을 수 있는 혜택이나 소득·재산 공제를 확인하고 싶어요",
        ),
        optional: true,
      },
    ]),
    ...draft.members.flatMap((member, i) => {
      const path = (key) => `members.${i}.${key}`;
      const prefix = `가구원 ${i + 1} / ${draft.members.length}`;
      return [
        question(
          `member-${i}-basic`,
          1,
          `${prefix} · 나이·공제 유형`,
          [
            {
              ...number(path("age"), `age-${i}`, "만 나이", "세", 120),
              placeholder: "계산한 만 나이를 입력하세요",
              hint: "**만 나이 계산 방법**\n1. **올해 연도 − 출생 연도**를 계산합니다.\n2. **올해 생일이 지나지 않았다면** 결과에서 **1년**을 뺍니다.\n예) 차이가 66세인 경우: 생일 지남 → **만 66세** / 생일 전 → **만 65세**",
            },
            select(
              path("deduction"),
              `deduction-${i}`,
              "이 가구원의 공제 유형",
              deductionTypes,
            ),
          ],
          "deduction",
        ),
        question(
          `member-${i}-earned`,
          1,
          `${prefix} · 월급이 있나요?`,
          [
            amount(
              path("earned_income"),
              `earned-${i}`,
              "근로소득 (월·세전 기준)",
              "세금·4대보험료를 떼기 전 금액",
            ),
            select(
              path("earned_income_basis"),
              `earned-basis-${i}`,
              "입력한 근로소득의 기준",
              earnedIncomeBases,
              "실수령액은 세전 금액으로 자동 환산하지 않으며 추가 확인이 필요해요.",
              positive(path("earned_income")),
              true,
            ),
          ],
          "income",
        ),
        question(
          `member-${i}-business`,
          1,
          `${prefix} · 사업소득이 있나요?`,
          [
            amount(
              path("business_income"),
              `business-${i}`,
              "사업소득 (월·경비 차감 후)",
              "필요 경비를 빼고, 소득세·개인지방소득세를 빼기 전 금액",
            ),
            select(
              path("business_income_basis"),
              `business-basis-${i}`,
              "입력한 사업소득의 기준",
              businessIncomeBases,
              "매출액에서 경비를 임의로 빼지 않아요. 매출액만 알면 추가 확인이 필요해요.",
              positive(path("business_income")),
              true,
            ),
          ],
          "period",
        ),
        question(
          `member-${i}-other`,
          1,
          `${prefix} · 그 밖에 받는 돈이 있나요?`,
          [
            amount(
              path("other_income"),
              `other-${i}`,
              "연금·임대·이자 등 기타소득 (월)",
            ),
            amount(
              path("private_transfer_income"),
              `transfer-${i}`,
              "가족·지인에게 정기적으로 받는 돈 (월)",
            ),
          ],
        ),
      ];
    }),
    question("assets-home", 2, "가구의 주택과 보증금을 알려주세요", [
      amount(
        "assets.housing",
        "housing",
        "거주 중인 소유 주택",
        "실거래가가 아닌 시가표준액",
      ),
      amount(
        "assets.rental_deposit",
        "deposit",
        "전월세 보증금",
        "계약서에 적힌 보증금. 소유 주택과 같은 금액을 두 번 입력하지 마세요.",
      ),
    ]),
    question("assets-other", 2, "그 밖의 재산이 있나요?", [
      amount(
        "assets.general",
        "general",
        "기타 일반재산",
        "거주하지 않는 부동산 등 공적 평가액",
      ),
      amount(
        "assets.financial",
        "financial",
        "금융재산",
        "예금·주식·보험 해약환급금 등",
      ),
    ]),
    question(
      "debts",
      3,
      "가구에 갚아야 할 부채가 있나요?",
      [
        {
          ...amount(
            "debts.bank",
            "bank",
            "금융기관 부채",
            "인정 가능한 대출의 남은 원금",
          ),
          example: "예: 은행·저축은행·보험사 대출",
        },
        {
          ...amount(
            "debts.public",
            "public",
            "공공기관 부채",
            "인정 가능한 대출의 남은 원금",
          ),
          example: "예: 한국장학재단 학자금대출",
        },
        amount("debts.other", "other-debt", "추가 확인이 필요한 부채"),
      ],
      "debt",
    ),
    question("vehicles", 4, "가구에서 보유하거나 빌려 쓰는 차량이 있나요?", [
      select("vehicle_status", "vehicle-status", "차량 보유 여부", [
        ["unknown", "모름"],
        ["none", "없음"],
        ["owned", "있음"],
      ]),
    ]),
    ...draft.vehicles.flatMap((vehicle, i) => {
      const path = (key) => `vehicles.${i}.${key}`;
      const prefix = `차량 ${i + 1} / ${draft.vehicles.length}`;
      return [
        question(`vehicle-${i}-use`, 4, `${prefix} · 명의와 사용 목적`, [
          select(
            path("ownership"),
            `vehicle-owner-${i}`,
            "차량 명의·계약 형태",
            vehicleOwnerships,
            "공동명의도 차량 전체 가액을 입력하세요. 리스·회사 차량은 해당 공고에서 별도 확인이 필요해요.",
          ),
          select(
            path("registration_use"),
            `registration-${i}`,
            "등록증상 영업용 여부",
            vehicleRegistrationUses,
            "사업자등록이 있다는 이유만으로 영업용 차량이 되지는 않아요.",
          ),
          select(
            path("use"),
            `vehicle-use-${i}`,
            "실제 차량 사용 목적",
            vehicleUses,
            "출퇴근에 쓰는 것만으로 생업용 특례를 적용하지 않아요.",
          ),
        ]),
        question(
          `vehicle-${i}-value`,
          4,
          `${prefix} · 차량 가액`,
          [
            amount(
              path("value"),
              `vehicle-value-${i}`,
              "차량 전체 가액",
              "구입 가격·중고 시세와 공고에서 쓰는 가액은 다를 수 있어요.",
            ),
            select(
              path("value_basis"),
              `vehicle-value-basis-${i}`,
              "차량 금액의 기준",
              vehicleValueBases,
            ),
          ],
          "vehicle",
        ),
        question(`vehicle-${i}-spec`, 4, `${prefix} · 차량 제원과 보조금`, [
          select(path("kind"), `vehicle-kind-${i}`, "차종", vehicleKinds),
          number(path("displacement_cc"), `cc-${i}`, "배기량", "cc", 20000),
          number(
            path("age_years"),
            `vehicle-age-${i}`,
            "차량 사용 연수",
            "년",
            100,
          ),
          number(path("seats"), `seats-${i}`, "승차 정원", "명", 100, 1),
          select(
            path("eco_subsidy"),
            `vehicle-subsidy-${i}`,
            "친환경차 구입 보조금",
            vehicleSubsidies,
            "전기·수소차 등 구입 때 받은 지원금. 받은 경우 차감 여부를 추가 확인해요.",
          ),
        ]),
      ];
    }),
  ];
}

export function visibleFields(question, draft) {
  return question.fields.filter((field) => !field.when || field.when(draft));
}

export function validateQuestion(question, draft) {
  for (const field of visibleFields(question, draft)) {
    const value = fieldValue(draft, field.path);
    try {
      if (field.path === "household_size") {
        parseInteger(value, field.label, {
          min: 1,
          max: MAX_HOUSEHOLD_SIZE,
          required: true,
        });
      } else if (field.type === "money") {
        parseMoney(value, field.label, { required: value?.unit === "manwon" });
      } else if (field.type === "number") {
        parseInteger(value, field.label, {
          min: field.min ?? 0,
          max: field.max ?? MAX_MONEY,
        });
      } else if (
        field.type === "select" &&
        field.required &&
        (value === null || value === undefined || value === "")
      ) {
        throw new Error(`${field.label}을(를) 선택해 주세요.`);
      } else if (
        field.type === "select" &&
        !field.options.some(
          ([key]) => String(key) === String(value ?? "unknown"),
        )
      ) {
        throw new Error(`${field.label}을(를) 선택해 주세요.`);
      } else if (
        field.type === "select" &&
        field.required &&
        value === "unknown"
      ) {
        throw new Error("양수 소득의 입력 기준을 선택해 주세요.");
      }
    } catch (error) {
      return { message: error.message, field: field.id, question: question.id };
    }
  }
  return null;
}
