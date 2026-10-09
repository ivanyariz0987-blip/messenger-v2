import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1) Replace these two placeholders with your Supabase project values.
// Supabase Dashboard -> Project Settings -> API.
const SUPABASE_URL = "https://hgxpvyubdaibosbnzdxn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_2ofadDMyZrozOZJTETzceg_Dfe_UlQB";
const READY = SUPABASE_URL.startsWith("https://") && !SUPABASE_URL.includes("PASTE_") && !SUPABASE_ANON_KEY.includes("PASTE_");

const $ = id => document.getElementById(id);
let supabase = null, currentUser = null, profileName = "", channel = null, messages = [];
const ROOM_ID = "00000000-0000-4000-8000-000000000001";

function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function initials(s){return (s||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]||"").join("").toUpperCase();}
function timeLabel(ts){return new Date(ts).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"});}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove("show"),3000);}
function setConnected(ok, label){$("connectionBadge").textContent=label;$("connectionBadge").classList.toggle("online",ok);$("modeLabel").textContent=ok?"Общая база подключена":"Нет соединения с базой";}

function showApp(){
  $("authView").classList.add("hidden");$("chatView").classList.remove("hidden");
  $("myIdentity").textContent=`${profileName} · тестовый аккаунт`;
  $("profileButton").textContent=initials(profileName).slice(0,2);
  $("chatList").innerHTML=`<div class="chat-item selected" id="generalChatItem"><div class="chat-avatar">М</div><div class="chat-copy"><strong>Общий чат</strong><p>Все участники тестовой версии</p></div></div>`;
  $("generalChatItem").addEventListener("click",()=>$("chatView").classList.add("mobile-chat"));
  if(window.innerWidth<=700)$("chatView").classList.add("mobile-chat");
  renderMessages();
}
function renderMessages(){
  const search=$("searchInput").value.trim().toLowerCase();
  const visible=messages.filter(m=>!search||m.body.toLowerCase().includes(search)||String(m.display_name||"").toLowerCase().includes(search));
  $("messages").innerHTML=visible.map(m=>{
    const mine=m.sender_id===currentUser?.id;
    const label=m.display_name||"Пользователь";
    return `<div class="message-row ${mine?"mine":""}"><div class="bubble">${mine?"":`<strong style="font-size:10px;display:block;margin-bottom:4px;opacity:.75">${escapeHtml(label)}</strong>`}${escapeHtml(m.body)}</div><div class="message-meta">${timeLabel(m.created_at)}</div></div>`;
  }).join("");
  if(!visible.length)$("messages").innerHTML=`<div class="day-label">${search?"Ничего не найдено":"Сообщений пока нет. Напиши первым!"}</div>`;
  $("messages").scrollTop=$("messages").scrollHeight;
}
async function loadMessages(){
  const {data,error}=await supabase.from("messages").select("id,sender_id,body,created_at,display_name").eq("room_id",ROOM_ID).order("created_at",{ascending:true}).limit(300);
  if(error){console.error(error);toast("Не удалось загрузить сообщения. Проверь SQL и RLS.");return;}
  messages=data||[];renderMessages();
}
async function startRealtime(){
  if(channel)await supabase.removeChannel(channel);
  channel=supabase.channel("public-room-messages")
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`room_id=eq.${ROOM_ID}`},payload=>{
      if(!messages.some(m=>m.id===payload.new.id)){messages.push(payload.new);messages.sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));renderMessages();}
    }).subscribe(status=>{
      if(status==="SUBSCRIBED")setConnected(true,"В сети");
      else if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")setConnected(false,"Нет связи");
    });
}
async function signIn(name){
  if(!READY){toast("Сначала вставь URL и ключ Supabase в app.js");return;}
  try{
    supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    const {data:sessionData}=await supabase.auth.getSession();
    let user=sessionData.session?.user;
    if(!user){
      const {data,error}=await supabase.auth.signInAnonymously();
      if(error)throw error;
      user=data.user;
    }
    currentUser=user;profileName=name.trim().slice(0,32)||"Пользователь";
    const {error:profileError}=await supabase.from("profiles").upsert({id:user.id,display_name:profileName},{onConflict:"id"});
    if(profileError)throw profileError;
    showApp();setConnected(false,"Подключение");await loadMessages();await startRealtime();
    toast("Подключено к общему чату");
  }catch(err){console.error(err);toast("Ошибка входа: "+(err.message||"проверь настройки Supabase"));}
}
$("loginForm").addEventListener("submit",e=>{e.preventDefault();signIn($("nameInput").value);});
$("messageForm").addEventListener("submit",async e=>{
  e.preventDefault();if(!supabase||!currentUser)return;
  const input=$("messageInput"),body=input.value.trim();if(!body)return;
  input.disabled=true;
  const {error}=await supabase.from("messages").insert({room_id:ROOM_ID,sender_id:currentUser.id,display_name:profileName,body});
  input.disabled=false;
  if(error){toast("Не отправлено: "+error.message);return;}
  input.value="";
});
$("searchInput").addEventListener("input",renderMessages);
$("backButton").addEventListener("click",()=>$("chatView").classList.remove("mobile-chat"));
$("profileButton").addEventListener("click",()=>{
  if(!currentUser)return;
  $("profileDetails").innerHTML=`<strong>${escapeHtml(profileName)}</strong><br><span class="muted">Тестовый аккаунт без SMS<br>ID: ${escapeHtml(currentUser.id)}</span>`;
  $("profileDialog").showModal();
});
$("closeProfile").addEventListener("click",()=>$("profileDialog").close());
$("logoutButton").addEventListener("click",async()=>{
  if(supabase)await supabase.auth.signOut();
  currentUser=null;profileName="";messages=[];if(channel){await supabase.removeChannel(channel);channel=null;}
  $("profileDialog").close();$("chatView").classList.add("hidden");$("authView").classList.remove("hidden");setConnected(false,"Не подключено");
});
if(!READY){
  $("statusLine").textContent="Нужно подключить базу данных";
  $("modeLabel").textContent="Ожидает настройки Supabase";
  $("connectionBadge").textContent="Не настроено";
  $("messages").innerHTML='<div class="day-label">Сначала настрой Supabase по README.md, затем добавь URL и ключ в app.js.</div>';
}
