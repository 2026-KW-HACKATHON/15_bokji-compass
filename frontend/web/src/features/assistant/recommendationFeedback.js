// Empty recommendations are a successful response. HTTP errors never mean no notices.
export function recommendationFailure(error) {
  if (error?.status === 401)
    return {
      title: '로그인 상태를 다시 확인해 주세요',
      message: '로그인이 만료되었을 수 있어요. 다시 로그인한 뒤 추천 공고를 확인해 주세요.',
      action: 'login',
    };
  if (error?.status === 400 || error?.status === 422)
    return {
      title: '추천에 쓰는 정보를 확인해 주세요',
      message: '입력한 정보를 확인한 뒤 다시 추천받아 주세요.',
      action: 'profile',
    };
  if (error?.status === 429)
    return {
      title: '추천 요청이 많아 잠시 기다려 주세요',
      message: '잠시 후 다시 시도하면 추천 공고를 확인할 수 있어요.',
      action: 'retry',
    };
  if (error?.code === 'timeout' || error?.status === 504)
    return {
      title: '추천 공고 확인이 늦어지고 있어요',
      message: '응답에 시간이 조금 더 걸리고 있어요. 잠시 후 다시 시도해 주세요.',
      action: 'retry',
    };
  if (error?.code === 'network')
    return {
      title: '추천 서비스에 잠시 연결하지 못했어요',
      message:
        '인터넷 연결을 확인한 뒤 다시 시도해 주세요. 연결이 계속 안 되면 잠시 후 이용해 주세요.',
      action: 'retry',
    };
  return {
    title: '추천 정보를 잠시 확인할 수 없어요',
    message: '서비스 연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요.',
    action: 'retry',
  };
}
