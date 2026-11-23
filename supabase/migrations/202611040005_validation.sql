begin;
create function public.valid_email_block(b jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare key text; value jsonb;
begin
 if jsonb_typeof(b) is distinct from 'object' then return false; end if;
 foreach key in array array['id','kind','text','url','src','alt','color','background','font','align'] loop
  if jsonb_typeof(b->key) is distinct from 'string' then return false; end if;
 end loop;
 if b->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' or b->>'kind' not in ('Heading','Paragraph','Image','Button','Divider','Spacer','Two columns','Three columns','Social links','Logo','Footer','Product') or b->>'align' not in ('left','center','right') then return false; end if;
 if length(b->>'text')>20000 or length(b->>'url')>2048 or length(b->>'src')>2000000 or length(b->>'alt')>500 or length(b->>'font')>100 or length(b->>'color')>50 or length(b->>'background')>50 then return false; end if;
 foreach key in array array['size','weight','lineHeight','padding','radius','width','border','gap'] loop
  if jsonb_typeof(b->key) is distinct from 'number' then return false; end if;
 end loop;
 if (b->>'size')::numeric not between 8 and 72 or (b->>'weight')::numeric not between 100 and 900 or (b->>'lineHeight')::numeric not between 1 and 3 or (b->>'padding')::numeric not between 0 and 80 or (b->>'radius')::numeric not between 0 and 50 or (b->>'width')::numeric not between 10 and 100 or (b->>'border')::numeric not between 0 and 10 or (b->>'gap')::numeric not between 0 and 64 then return false; end if;
 if jsonb_typeof(b->'columns') is distinct from 'array' or jsonb_array_length(b->'columns')>3 then return false; end if;
 for value in select * from jsonb_array_elements(b->'columns') loop
  if jsonb_typeof(value) is distinct from 'string' or length(value#>>'{}')>20000 then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
create function public.valid_email_document(d jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare key text; b jsonb; ids text[]:=array[]::text[];
begin
 if jsonb_typeof(d) is distinct from 'object' or d->'version' is distinct from '2'::jsonb then return false; end if;
 foreach key in array array['id','source','name','category','modified','background','status'] loop
  if jsonb_typeof(d->key) is distinct from 'string' then return false; end if;
 end loop;
 if d->>'id' !~ '^[A-Za-z0-9_-]{1,100}$' or length(trim(d->>'name'))<1 or length(d->>'name')>200 or length(d->>'source')>100 or length(d->>'category')>100 or length(d->>'background')>50 or d->>'status' not in ('Draft','Saved') then return false; end if;
 if d->>'modified' !~ '^\d{4}-\d{2}-\d{2}T' then return false; end if;
 perform (d->>'modified')::timestamptz;
 if jsonb_typeof(d->'width') is distinct from 'number' or (d->>'width')::numeric not between 320 and 800 then return false; end if;
 if d?'subject' and (jsonb_typeof(d->'subject') is distinct from 'string' or length(d->>'subject')>200) then return false; end if;
 if d?'preheader' and (jsonb_typeof(d->'preheader') is distinct from 'string' or length(d->>'preheader')>300) then return false; end if;
 if jsonb_typeof(d->'blocks') is distinct from 'array' or jsonb_array_length(d->'blocks')>300 then return false; end if;
 for b in select * from jsonb_array_elements(d->'blocks') loop
  if not valid_email_block(b) or b->>'id'=any(ids) then return false; end if;
  ids:=array_append(ids,b->>'id');
 end loop;
 return true;
exception when others then return false;
end $$;
create function public.valid_workspace_resource(kind text, payload jsonb) returns boolean language plpgsql immutable set search_path=public as $$
declare key text; b jsonb;
begin
 if kind='blocks' then
  if jsonb_typeof(payload) is distinct from 'array' or jsonb_array_length(payload)>100 then return false; end if;
  for b in select * from jsonb_array_elements(payload) loop if not valid_email_block(b) then return false; end if; end loop;
  return true;
 elsif kind='brand' then
  foreach key in array array['name','logo','primary','secondary','heading','body','website','socials'] loop
   if jsonb_typeof(payload->key) is distinct from 'string' then return false; end if;
  end loop;
  return length(payload->>'name')<=200 and length(payload->>'logo')<=2000000 and length(payload->>'website')<=2048 and length(payload->>'socials')<=10000 and payload->>'primary'~*'^#[a-f0-9]{6}$' and payload->>'secondary'~*'^#[a-f0-9]{6}$' and payload->>'heading' in ('Arial','Georgia','Verdana','Tahoma','Trebuchet MS') and payload->>'body' in ('Arial','Georgia','Verdana','Tahoma','Trebuchet MS');
 end if;
 return false;
exception when others then return false;
end $$;
alter table documents add constraint valid_document_content check(valid_email_document(content));
alter table document_versions add constraint valid_version_content check(valid_email_document(content));
alter table template_catalog add constraint valid_catalog_content check(valid_email_document(content));
alter table workspace_resources add constraint valid_resource_content check(valid_workspace_resource(kind,content));
revoke all on function valid_email_block(jsonb),valid_email_document(jsonb),valid_workspace_resource(text,jsonb) from public,anon,authenticated;
grant execute on function valid_email_block(jsonb),valid_email_document(jsonb),valid_workspace_resource(text,jsonb) to authenticated,service_role;
-- Asset bookkeeping can only be removed together with the object by a server operation.
revoke delete on assets from authenticated;
drop policy assets_cleanup on assets;
commit;
