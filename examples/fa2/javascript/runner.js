let subcontract =
`export default e=>{console.log("hello from  subcontract");var t=new URL(e.url);switch(t.pathname){case"/transfer":var o=t.searchParams.get("to_address"),r=+t.searchParams.get("token_id"),s=+t.searchParams.get("amount"),n=t.searchParams.get("fa2_contract"),o=[{from:Ledger.selfAddress(),transfers:[{to:o,token_id:r,amount:s}]}],r=new Request(\`tezos://\${n}/transfer\`,{method:"POST",body:JSON.stringify(o)});return console.info(r.url),Contract.call(r);case"/add_operator":{s=t.searchParams.get("fa2_contract"),n=JSON.parse(t.searchParams.get("tokens"));let r=e.headers.get("Referer"),a=Ledger.selfAddress();o=n.map(e=>({operation:"add_operator",owner:a,operator:r,token_id:e}));console.info(JSON.stringify(o));let e=new Request(\`tezos://\${s}/\`,{method:"PUT",body:JSON.stringify(o)});return Contract.call(e)}}};`

async function showBalances(addresses, contracts, tokens) {
    let requests = contracts.flatMap((owner) => tokens.map((token_id) => ({ owner, token_id })));
    let encodedRequests = TextEncoder.btoa(JSON.stringify(requests));
    let request = new Request(`tezos://${addresses.fa2Contract}/balance_of?requests=${encodedRequests}&callback=${addresses.displayContract}`);
    let response = await Contract.call(request);
    return response;
}
async function updateOperators(fa2Contract, contracts, tokens) {
    let promises = contracts.map((address) => Contract.call(new Request(`tezos://${address}/add_operator?fa2_contract=${fa2Contract}&tokens=${tokens}`)));
    return Promise.all(promises);
}
async function createContracts(n) {
    let promises = [];
    for (let i = 0; i < n; ++i) {
        promises.push(Ledger.createContract(subcontract));
    }
    return Promise.all(promises);
}
async function mintTokens(fa2, ...tokens) {
    let request = new Request(`tezos://${fa2}/mint_new`, {
        method: "POST",
        body: JSON.stringify(tokens)
    });
    return await Contract.call(request);
}
async function requestTransfer(fa2, from, to, token_id, amount) {
    let request = new Request(`tezos://${from}/transfer?fa2_contract=${fa2}&to_address=${to}&token_id=${token_id}&amount=${amount}`);
    return Contract.call(request);
}
async function stealTokens(fa2Contract, ...steals) {
    let to = Ledger.selfAddress();
    let transfers = steals.map(({ from, tokens }) => ({
        from,
        transfers: tokens.map(({ amount, token_id }) => ({ to, token_id, amount }))
    }));
    let request = new Request(`tezos://${fa2Contract}/transfer`, {
        method: "POST",
        body: JSON.stringify(transfers)
    });
    return Contract.call(request);
}
async function runStuff(addresses) {
    try {
        console.info("Creating some contracts");
        let contracts = await createContracts(2);
        await showBalances(addresses, contracts, [1, 2]);
        console.info("Minting some tokens");
        await mintTokens(addresses.fa2Contract, { owner: contracts[0], token_id: 1, amount: 3 }, { owner: contracts[1], token_id: 2, amount: 3 });
        await showBalances(addresses, contracts, [1, 2]);
        console.info("Transfering some tokens");
        await Promise.all([
            requestTransfer(addresses.fa2Contract, contracts[0], contracts[1], 1, 1),
            requestTransfer(addresses.fa2Contract, contracts[1], contracts[0], 2, 1)
        ]);
        console.info("Trying to steal tokens");
        try {
            await stealTokens(addresses.fa2Contract, { from: contracts[0], tokens: [{ token_id: 1, amount: 2 }, { token_id: 2, amount: 1 }] }, { from: contracts[1], tokens: [{ token_id: 1, amount: 1 }, { token_id: 2, amount: 2 }] });
        }
        catch (error) {
            console.log(`Didn't work 😭 recieved error ${error}`);
            await showBalances(addresses, contracts, [1, 2]);
        }
        console.info("updating some operators");
        await updateOperators(addresses.fa2Contract, contracts, [1, 2]);
        console.info("Trying to steal tokens again");
        await stealTokens(addresses.fa2Contract, { from: contracts[0], tokens: [{ token_id: 1, amount: 2 }, { token_id: 2, amount: 1 }] }, { from: contracts[1], tokens: [{ token_id: 1, amount: 1 }, { token_id: 2, amount: 2 }] });
        await showBalances(addresses, contracts, [1, 2]);
    }
    catch (error) {
        console.error("error in runner", error);
        throw (error);
    }
}
async function handler(request) {
    let url = new URL(request.url);
    let addresses = {
        fa2Contract: url.searchParams.get("fa2_contract"),
        displayContract: url.searchParams.get("display_contract")
    };
    await runStuff(addresses);
    return new Response("success");
}
export default handler;
