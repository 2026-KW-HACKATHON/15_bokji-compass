import { parsePolicy } from "../policies/model";
export type Policy = ReturnType<typeof parsePolicy>;
export type LifeProfile = {
  occupation: string | null;
  household: string | null;
  interests: string[];
  housing_tenure: string | null;
  housing_type: string | null;
  building_year: number | null;
  repair_needed: boolean | null;
  job_seeking: boolean | null;
  disaster_type: string | null;
  disaster_damage: boolean | null;
  disaster_occurred_on: string | null;
};
export type Candidate = {
  need_id: string;
  policy_id: string;
  policy: Policy;
  status: string;
  reason: string;
  questions: string[];
  state: string;
  active: boolean;
  schedule_status: string;
};
export type Snapshot = {
  profile: LifeProfile | null;
  enabled: boolean;
  updated_at: string | null;
  last_checked_at: string | null;
  needs: {
    id: string;
    title: string;
    reason: string;
    keywords: string[];
    questions: string[];
  }[];
  candidates: Candidate[];
  alerts: {
    id: string;
    policy_id: string;
    need_id: string;
    title: string;
    body: string;
    created_at: string;
    read: boolean;
  }[];
  unread_count: number;
  scan_status: string | null;
};
export type Dialogue = {
  answer: string;
  continuation: string;
  answer_accepted?: boolean | null;
  catalog_status: string;
  confirmed_fields: string[];
  profile_draft: LifeProfile;
  can_save_profile: boolean;
  practical_steps: string[];
  source_links: { label: string; url: string }[];
  missing_fields: { slot: string; label: string }[];
  candidates: Candidate[];
  follow_up: null | {
    slot: string;
    question: string;
    input_type: string;
    allow_unknown: true;
    options: { label: string; value: string | number | boolean | null }[];
  };
  selected_policy: null | {
    policy: Policy;
    comparison: {
      status: string;
      notes: string[];
      checks: { label: string; state: string; note: string; quote: string }[];
    };
  };
};
