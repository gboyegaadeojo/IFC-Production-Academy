-- Academy copyright reviewers get a notification when a request is sent to them (ADD-COPY-05;
-- G, 2026-11-13): in the bell, and instantly on phones with alerts on, through the existing push
-- dispatch. Never emailed as a notification, because the copyright email already goes.

create function private.copyright_review_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.copyright_requests;
begin
  if new.user_id is null then
    return new;
  end if;
  select * into v_req from public.copyright_requests r where r.id = new.request_id;
  perform private.notify(
    new.user_id, 'copyright_review',
    'Copyright review: ' || left(v_req.description, 80),
    'For ' || private.copyright_day_label(v_req.service_day)
      || coalesce('. Quality control asks: ' || left(v_req.review_question, 200), ''),
    '/copyright/requests/' || new.request_id,
    'copyright_review:' || new.request_id || ':' || new.user_id);
  return new;
end;
$$;
revoke all on function private.copyright_review_alert() from public, anon, authenticated;

create trigger copyright_review_assignments_alert
  after insert on public.copyright_review_assignments
  for each row execute function private.copyright_review_alert();

-- Its email is the copyright email, not a notification email. Only ever turns email off.
create function private.copyright_review_no_notification_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'copyright_review' then
    new.email_status := 'skipped';
  end if;
  return new;
end;
$$;
revoke all on function private.copyright_review_no_notification_email() from public, anon, authenticated;

create trigger notifications_copyright_review_no_email
  before insert on public.notifications
  for each row execute function private.copyright_review_no_notification_email();
