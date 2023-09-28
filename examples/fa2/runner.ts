import { Address, isAddress, Ledger, Kv, TextEncoder, Contract } from "./jstz_api"
import { BalanceRequest, MintNew, Transfer, Transfers, UpdateOperator} from "./fa2"

type Addresses = {
    fa2Contract: Address,
    displayContract: Address
};
let subcontract = 'function handler(request){const url=new URL(request.url);const path=url.pathname;try{switch(path){case"/ping":console.log("Hello from subcontract 👋");return new Response("Pong!");case"/transfer":{let to=url.searchParams.get("to_address");let token_id=+url.searchParams.get("token_id");let amount=+url.searchParams.get("amount");let target=url.searchParams.get("fa2_contract");let transfers=[{from:Ledger.selfAddress(),transfers:[{to:to,token_id:token_id,amount:amount}]}];let request=new Request(`tezos://${target}/transfer`,{method:"POST",body:JSON.stringify(transfers)});console.info(request.url);return Contract.call(request)}case"/add_operator":{let target=url.searchParams.get("fa2_contract");let tokens=JSON.parse(url.searchParams.get("tokens"));let operator=request.headers.get("Referer");let owner=Ledger.selfAddress();let body=tokens.map(token_id=>({operation:"add_operator",owner:owner,operator:operator,token_id:token_id}));console.info(JSON.stringify(body));let request=new Request(`tezos://${target}/`,{method:"PUT",body:JSON.stringify(body)});return Contract.call(request)}}}catch(error){console.error(error);return Response.error()}}export default handler;'

async function showBalances(addresses: Addresses, contracts : Address[], tokens : number []) : Promise<Response>{
    let requests : BalanceRequest [] = contracts.flatMap((owner) => tokens.map((token_id) => ({ owner, token_id })));
    let encodedRequests = TextEncoder.btoa(JSON.stringify(requests));
    let request = new Request(`tezos://${addresses.fa2Contract}/balance_of?requests=${encodedRequests}&callback=${addresses.displayContract}`)
    let response = await Contract.call(request);
    return response;
}

async function updateOperators(fa2Contract: Address, contracts : Address[], tokens : number []) : Promise<Response[]>{
    let promises = contracts.map((address) =>
        Contract.call(
            new Request(`tezos://${address}/add_operator?fa2_contract=${fa2Contract}&tokens=${JSON.stringify(tokens)}`)
        )
    );
    return Promise.all(promises);
}
async function createContracts(n : number) : Promise<Address []> {
    let promises = [];
    for (let i = 0; i < n; ++i) {
        promises.push(Ledger.createContract(subcontract));
    }
    return Promise.all(promises);
}

async function mintTokens(fa2 : Address, ...tokens: MintNew []) : Promise<Response>{
    let request = new Request(`tezos://${fa2}/mint_new`, {
        method: "POST",
        body: JSON.stringify(tokens)
    });
    return await Contract.call(request);
}
async function requestTransfer(fa2 : Address, from : Address, to : Address, token_id : number, amount : number ) : Promise<Response>{
    let request = new Request(`tezos://${from}/transfer?fa2_contract=${fa2}&to_address=${to}&token_id=${token_id}&amount=${amount}`)
    return Contract.call(request);
}
async function stealTokens(fa2Contract : Address, ...steals : {from: Address, tokens: {amount: number, token_id: number} []} []) : Promise<Response> {

    let to = Ledger.selfAddress();
    let transfers = steals.map(
        ({from, tokens}) => ({
            from,
            transfers : tokens.map(
                ({amount, token_id}) => ({to, token_id, amount})
            )
        })
    );
    let request = new Request(`tezos://${fa2Contract}/transfer`, {
        method: "POST",
        body: JSON.stringify(transfers)
    });
    return Contract.call(request);
}

async function runStuff(addresses : Addresses) {
    try{
        console.info("Creating some contracts");
        let contracts = await createContracts(2);
        await showBalances(addresses, contracts, [1,2]);

        console.info("Minting some tokens")
        await mintTokens(addresses.fa2Contract,
            {owner: contracts[0], token_id: 1, amount: 3},
            {owner: contracts[1], token_id: 2, amount: 3},
        );
        await showBalances(addresses, contracts, [1,2]);

        console.info("Transfering some tokens")
        await Promise.all([
            requestTransfer(addresses.fa2Contract, contracts[0], contracts[1], 1, 1 ),
            requestTransfer(addresses.fa2Contract, contracts[1], contracts[0], 2, 1 )
        ]);

        console.info("Trying to steal tokens")
        try {
            await stealTokens(addresses.fa2Contract,
                     {from: contracts[0], tokens: [{token_id: 1, amount: 2}, {token_id: 2, amount: 1}]},
                     {from: contracts[1], tokens: [{token_id: 1, amount: 1}, {token_id: 2, amount: 2}]}
                       )

        } catch (error) {
            console.log(`Didn't work 😭 recieved error ${error}`);
            await showBalances(addresses, contracts, [1,2]);
        }
        console.info("updating some operators");
        await updateOperators(addresses.fa2Contract, contracts, [1,2])

        console.info("Trying to steal tokens again")
            await stealTokens(addresses.fa2Contract,
                     {from: contracts[0], tokens: [{token_id: 1, amount: 2}, {token_id: 2, amount: 1}]},
                     {from: contracts[1], tokens: [{token_id: 1, amount: 1}, {token_id: 2, amount: 2}]}
                       )


        await showBalances(addresses, contracts, [1,2]);




    } catch (error) {
      console.error(error);
      throw(error)
    }
}
async function handler(request: Request): Promise<Response> {
    let url = new URL(request.url);
    if (url.pathname == "/ping") {
        console.log("Hello from runner contract 👋")
        return new Response("Pong");
    }
    let addresses = {
        fa2Contract: url.searchParams.get("fa2_contract"),
        displayContract: url.searchParams.get("display_contract")
    };
    await runStuff(addresses);
    return new Response("success");
}

export default handler;
