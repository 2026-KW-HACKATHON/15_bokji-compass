export const postcodeResults = {
  서울: {
    zonecode: '04524',
    sido: '서울특별시',
    sigungu: '중구',
    userSelectedType: 'R',
    address: '서울 중구 세종대로 110',
    roadAddress: '서울 중구 세종대로 110',
    jibunAddress: '서울 중구 태평로1가 31',
  },
  부산: {
    zonecode: '47545',
    sido: '부산광역시',
    sigungu: '연제구',
    userSelectedType: 'R',
    address: '부산 연제구 중앙대로 1001',
    roadAddress: '부산 연제구 중앙대로 1001',
    jibunAddress: '부산 연제구 연산동 1000',
  },
};

function installMock(results) {
  class Postcode {
    constructor(options) {
      this.options = options;
    }
    embed(element) {
      const group = document.createElement('div');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', '테스트 주소 검색 결과');
      for (const [region, result] of Object.entries(results)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `테스트 주소 선택: ${region}`;
        button.onclick = () => this.options.oncomplete(result);
        group.append(button);
      }
      element.replaceChildren(group);
      this.options.onresize?.({ height: 180 });
    }
  }
  window.daum = { ...window.daum, Postcode };
  window.kakao = { ...window.kakao, Postcode };
}

// Simulated provider results exercise the application callback without a network dependency.
export async function mockPostcode(page, { preload = true, failedLoads = 0 } = {}) {
  const state = { loads: 0 };
  await page.route('**/postcode.v2.js**', (route) => {
    state.loads += 1;
    if (state.loads <= failedLoads) return route.abort('failed');
    return route.fulfill({
      contentType: 'application/javascript',
      body: `(${installMock.toString()})(${JSON.stringify(postcodeResults)});`,
    });
  });
  if (preload) await page.addInitScript(installMock, postcodeResults);
  return state;
}

export async function selectPostcode(form, region) {
  await form.getByRole('button', { name: '주소 검색', exact: true }).click();
  await form.getByRole('button', { name: `테스트 주소 선택: ${region}`, exact: true }).click();
}

export function addressPayload(region, detail = null) {
  return {
    region,
    postal_code: postcodeResults[region].zonecode,
    address: postcodeResults[region].roadAddress,
    address_detail: detail,
  };
}
