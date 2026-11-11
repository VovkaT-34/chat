import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("MY_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession:false, autoRefreshToken:false } });
const corsHeaders={"Access-Control-Allow-Origin":"https://vovkat-34.github.io","Access-Control-Allow-Headers":"authorization,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...corsHeaders}})}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS") return new Response("ok",{status:200,headers:corsHeaders});
 if(req.method!=="POST") return json({error:"Method not allowed"},405);
 try{
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token) return json({error:"Missing authorization"},401);
  const {data:authData,error:authError}=await admin.auth.getUser(token);
  if(authError||!authData.user) return json({error:"Unauthorized"},401);
  const {data:adminProfile}=await admin.from("profiles").select("role,approved").eq("id",authData.user.id).maybeSingle();
  if(!adminProfile||adminProfile.role!=="admin"||adminProfile.approved!==true) return json({error:"Forbidden"},403);
  const body=await req.json();
  const userId=String(body?.userId||"");
  if(!userId) return json({error:"Invalid userId"},400);
  if(userId===authData.user.id) return json({error:"Нельзя отклонить собственный аккаунт"},400);
  const {data:profile}=await admin.from("profiles").select("id,approved,role").eq("id",userId).maybeSingle();
  if(!profile) return json({error:"Пользователь не найден"},404);
  if(profile.approved===true) return json({error:"Одобренного пользователя нельзя отклонить этой кнопкой"},400);
  const {count:messageCount}=await admin.from("messages").select("id",{count:"exact",head:true}).eq("user_id",userId);
  if((messageCount||0)>0) return json({error:"Заявку нельзя удалить: у пользователя уже есть сообщения"},409);
  await admin.from("call_signals").delete().or(`sender_id.eq.${userId},recipient_id.eq.${userId}`);
  await admin.from("web_push_subscriptions").delete().eq("user_id",userId);
  await admin.from("message_deliveries").delete().eq("user_id",userId);
  await admin.from("user_chat_reads").delete().eq("user_id",userId);
  await admin.from("chat_members").delete().eq("user_id",userId);
  const {error:profileDeleteError}=await admin.from("profiles").delete().eq("id",userId);
  if(profileDeleteError) return json({error:profileDeleteError.message},500);
  const {error:authDeleteError}=await admin.auth.admin.deleteUser(userId);
  if(authDeleteError) return json({error:authDeleteError.message},500);
  return json({ok:true});
 }catch(error){console.error("admin-reject-user:",error);return json({error:"Internal server error"},500)}
});