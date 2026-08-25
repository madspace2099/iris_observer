-- Observer — contract. The superseded façades go.
--
-- **Do not apply this until no reachable deployment calls these names.**
--
-- That is a stronger condition than "Production has been promoted". Vercel
-- keeps every build it has ever made reachable at its own URL, and twelve
-- Preview deployments of `release/observer-demo-rc1` were READY when this was
-- written, each one calling `consume_ai_quota` and `record_ai_request`
-- directly. Promotion does not retire them; deleting them, or letting them age
-- out, does.
--
-- The check before applying, in order:
--
--   1. `main` carries the admission/completion code and Production serves it;
--   2. no other deployment anybody may still open is running an older build —
--      list them, do not assume;
--   3. `observer.ai_requests` has had no new `audit_version = 1` row for long
--      enough to be sure. That is the empirical version of (2), and the one
--      worth trusting:
--
--        select max(occurred_at) from observer.ai_requests where audit_version = 1;
--
-- Nothing here touches data. The rows those functions wrote stay exactly as
-- they are, labelled version 1 with authorship unknown, which is what they are.

drop function if exists public.consume_ai_quota(text, text, text, integer, integer, integer, integer);
drop function if exists public.record_ai_request(text, text, text, text, text, text, text, text[], integer, integer, integer, integer, integer);

-- `observer.consume_ai_quota` is deliberately **not** dropped. It is the single
-- implementation of the ceiling and `observer.admit_ai_request` calls it. Only
-- the reachable façade goes.
