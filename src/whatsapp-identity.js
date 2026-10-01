const PHONE=/^[1-9]\d{7,14}$/;
const BSUID=/^[A-Z]{2}\.[A-Za-z0-9._:-]{6,253}$/;
export const validWhatsappIdentity=value=>typeof value==='string'&&(PHONE.test(value)||BSUID.test(value));
export function whatsappIdentity(message){
 const phone=PHONE.test(message.from||'')?message.from:null;
 const userId=[message.from_user_id,message.from_parent_user_id].find(v=>typeof v==='string'&&BSUID.test(v));
 return {phone,id:userId||phone};
}
export function whatsappContactMatches(contact,message){
 const {phone}=whatsappIdentity(message);
 return Boolean(phone&&contact.wa_id===phone||message.from_user_id&&contact.user_id===message.from_user_id||message.from_parent_user_id&&contact.parent_user_id===message.from_parent_user_id);
}
