import{Ledger as a,TextEncoder as r,Contract as o}from"./jstz_api";let n=`
export default (request) => {
    const url = new URL(request.url);
    const path = url.pathname;
    switch (path) {
        case ("/transfer"):
            {
                let to = url.searchParams.get("to_address");
                let token_id = url.searchParams.get("token_id");
                let amount = url.searchParams.get("amount");
                let target = url.searchParams.get("fa2_contract");
                let transfers = TextEncoder.btoa(JSON.stringify({
                    from: Ledger.selfAddress(),
                    transfers: [{ to, token_id, amount }]
                }));
                let request = new Request(\`tezos://\${target}/transfer\`, {
                    method: "POST",
                    body: JSON.stringify({ to, token_id, amount }),
                });
                return Contract.call(request);
            }
        case ("/add_operator"):
            {
                let target = url.searchParams.get("fa2_contract");
                let request = new Request(\`tezos://\${target}/\`, {
                    method: "PUT",
                    body: [{
                        operation: "add_operator",
                        owner: Ledger.selfAddress(),
                        operator: url.searchParams.get("operator"),
                        token_id: url.searchParams.get("token_id")
                    }]
                });
                return Contract.call(request);
            }
    }
}
`;async function s(t,e,a){e=e.flatMap(e=>a.map(t=>({owner:e,token_id:t}))),e=r.btoa(JSON.stringify(e)),e=new Request(`tezos://${t.fa2Contract}/balance_of?requests=${e}&callback=`+t.displayContract);return await o.call(e)}async function c(t){var e=[];for(let t=0;t<2;++t)e.push(a.createContract(n));return Promise.all(e)}async function l(t,...e){t=new Request(`tezos://${t}/mint_new`,{method:"POST",body:JSON.stringify(e)});return o.call(t)}async function i(t,e,a,r,n){e=new Request(`tezos://${e}/fa2_contract/transfer?=${t}&to_address=${a}&token_id=${r}&amount=`+n);return o.call(e)}async function e(t){try{var e=await c(2);console.info("Creating some contracts"),await s(t,e,[1,2]),console.info("Minting some tokens"),await l(t.fa2Contract,{owner:e[0],token_id:1,amount:3},{owner:e[1],token_id:2,amount:3}),await s(t,e,[1,2,3]),console.info("Transfering some tokens"),await Promise.all([i(t.fa2Contract,e[0],e[1],1,1),i(t.fa2Contract,e[1],e[0],2,1)]),await s(t,e,[1,2,3])}catch(t){throw console.error(t),t}}async function t(t){t=new URL(t.url);return await e({fa2Contract:t.searchParams.get("fa2_contract"),displayContract:t.searchParams.get("display_contract")}),new Response("success")}export default t;
