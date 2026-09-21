-- 모두 가상 데이터. 실제 정책·실제 개인정보가 아닙니다.
-- 001_schema.sql 실행 후 최초 1회만 실행합니다. 재실행은 PK 중복 오류입니다.
USE bokji_compass_dev;
START TRANSACTION;
INSERT INTO regions (id, code, name, parent_id) VALUES
 (1, 'DEMO-A', '가상광역시', NULL),
 (2, 'DEMO-B', '가상특별시', NULL);
INSERT INTO regions (id, code, name, parent_id) VALUES (3, 'DEMO-A-1', '가상구', 1);
INSERT INTO users (id, display_name) VALUES (1, '테스트사용자A'), (2, '테스트사용자B');
INSERT INTO user_profiles (user_id, birth_date, birth_region_id, residence_region_id, residence_basis, residence_since) VALUES
 (1, '2000-05-10', 2, 3, 'registered', '2024-03-01'),
 (2, NULL, NULL, NULL, 'unknown', NULL);
INSERT INTO policies (id, title, organization, source_url, source_text, application_start, application_end) VALUES
 (1, '[가상] 청년 교육비 지원', '가상지원기관', 'https://example.invalid/policies/1',
 '테스트용 공고. 2026-01-01 기준 만 19~34세이며 가상광역시에 주민등록상 거주하는 사람. 실제 지원사업이 아닙니다.', '2026-01-01', '2026-12-31'),
 (2, '[가상] 출생지역 문화 지원', '가상문화기관', 'https://example.invalid/policies/2',
 '테스트용 공고. 가상특별시 출생자 대상. 연령 조건과 신청 기간은 원문에 미기재. 실제 지원사업이 아닙니다.', NULL, NULL);
INSERT INTO policy_requirements (id, policy_id, condition_type, information_state, evidence_text) VALUES
 (1, 1, 'age', 'specified', '2026-01-01 기준 만 19~34세'),
 (2, 1, 'residence_region', 'specified', '가상광역시에 주민등록상 거주'),
 (3, 2, 'birth_region', 'specified', '가상특별시 출생자 대상'),
 (4, 2, 'age', 'not_stated', '연령 조건 원문 미기재');
COMMIT;
