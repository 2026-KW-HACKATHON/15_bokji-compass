-- 읽기 전용 개발 확인 예제. 사용자 ID는 테스트 값입니다.
USE bokji_compass_dev;

-- 기대 행 수: regions=3, users=2, user_profiles=2, policies=2, policy_requirements=4
SELECT 'regions' AS table_name, COUNT(*) AS row_count FROM regions
UNION ALL SELECT 'users', COUNT(*) FROM users
UNION ALL SELECT 'user_profiles', COUNT(*) FROM user_profiles
UNION ALL SELECT 'policies', COUNT(*) FROM policies
UNION ALL SELECT 'policy_requirements', COUNT(*) FROM policy_requirements;

-- 선택 입력이 없는 사용자도 LEFT JOIN으로 보존합니다.
SELECT u.id, u.display_name, p.birth_date,
       b.name AS birth_region, r.name AS residence_region, p.residence_basis
FROM users u
LEFT JOIN user_profiles p ON p.user_id = u.id
LEFT JOIN regions b ON b.id = p.birth_region_id
LEFT JOIN regions r ON r.id = p.residence_region_id
WHERE u.id = 1;

-- 정책과 조건 원문 확인. 지원 자격 판정 결과가 아닙니다.
SELECT p.id, p.title, p.review_status, r.condition_type, r.information_state, r.evidence_text
FROM policies p JOIN policy_requirements r ON r.policy_id = p.id
ORDER BY p.id, r.id;

-- 공개 API에서 가상·미승인 정책을 제외하는 예제. 현재 기대 결과 0행.
SELECT id, title, source_url FROM policies
WHERE review_status = 'published' AND is_synthetic = FALSE;
