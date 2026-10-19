export function currency(value:unknown){return Number(String(value??0)).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
export function date(value:Date|string|null|undefined){return value?new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';}
export function inputDate(value:Date|string|null|undefined){return value?new Date(value).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'}):'';}
export function AdminHeader({title,description}:{title:string;description:string}){return <header className="platform-header"><small>Adega · Administração central</small><h1>{title}</h1><p>{description}</p></header>;}
export function Metric({label,value,detail}:{label:string;value:React.ReactNode;detail?:string}){return <div className="platform-metric"><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</div>;}
export function Panel({title,children}:{title:string;children:React.ReactNode}){return <section className="platform-panel"><h2>{title}</h2>{children}</section>;}
export function Empty({text}:{text:string}){return <p className="platform-empty">{text}</p>;}
const states:Record<string,string>={TRIAL:'Em teste',ACTIVE:'Ativa',PENDING:'Pendente',PAST_DUE:'Vencida',SUSPENDED:'Suspensa',CANCELLED:'Cancelada',DISCONNECTED:'Desconectada',ERROR:'Requer atenção',RECEIVED:'Recebido',PROCESSED:'Processado',FAILED:'Com falha',IGNORED:'Ignorado'};
export function Tag({children}:{children:React.ReactNode}){return <span className="platform-tag">{typeof children==='string'?(states[children]??children):children}</span>;}
