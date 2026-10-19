'use client';
export default function AdminError({reset}:{reset:()=>void}){return <section className="platform-panel" role="alert"><h2>Não foi possível carregar esta área</h2><p style={{marginBottom:20,color:'#6a7889'}}>Atualize a página ou tente novamente em alguns instantes.</p><button onClick={reset}>Tentar novamente</button></section>;}
