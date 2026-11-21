const modal=document.getElementById('registerModal');
const openers=document.querySelectorAll('.open-register');
const closeBtn=document.querySelector('.modal-close');
const nav=document.querySelector('.nav');
document.querySelector('.menu-toggle').addEventListener('click',()=>nav.classList.toggle('show'));
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('show')));
function openModal(){modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden'}
function closeModal(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.style.overflow=''}
openers.forEach(b=>b.addEventListener('click',openModal));
closeBtn.addEventListener('click',closeModal);
document.querySelector('.modal-backdrop').addEventListener('click',closeModal);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
const phone=document.querySelector('input[name="phone"]');
phone.addEventListener('input',()=>{let v=phone.value.replace(/[^\d]/g,'');if(v.startsWith('8'))v='7'+v.slice(1);if(v.startsWith('7'))v=v.slice(0,11);if(v.length>1){let d=v.slice(1);phone.value='+7'+(d.length?' ('+d.slice(0,3):'')+(d.length>=3?') ':'')+d.slice(3,6)+(d.length>=6?'-':'')+d.slice(6,8)+(d.length>=8?'-':'')+d.slice(8,10)}else phone.value=v?'+7':''});
const form=document.getElementById('registrationForm');
const submit=form.querySelector('button[type="submit"]');
const success=document.getElementById('formSuccess');
form.addEventListener('submit',async e=>{
 e.preventDefault(); if(!form.reportValidity())return;
 const fd=new FormData(form);
 const payload={fullname:String(fd.get('fullname')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),personalDataConsent:fd.get('personalDataConsent')==='on',marketingConsent:fd.get('marketingConsent')==='on'};
 submit.disabled=true;submit.textContent='ОТПРАВЛЯЕМ…';
 try{
  const response=await fetch('/api/applications',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'Не удалось отправить заявку. Попробуйте ещё раз.');
  form.hidden=true;success.hidden=false;
  success.innerHTML='<strong>Заявка принята!</strong><p>Номер заявки: '+String(result.applicationId).replace(/[&<>"']/g,'')+'. Администратор свяжется с вами.</p>';
 }catch(err){alert(err.message||'Ошибка соединения. Попробуйте позже.');}
 finally{submit.disabled=false;submit.innerHTML='Отправить заявку ↗';}
});
