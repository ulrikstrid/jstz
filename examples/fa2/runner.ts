import { Address, isAddress, Ledger, Kv, TextEncoder, Contract } from "./jstz_api"

type Addresses = {
    fa2Contract: Address,
    displayContract: Address
};

let subcontract = `
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
`

async function runStuff(fa2Contract: Address, displayContract: Address) {
    let promises = [];
    for (let i = 0; i < 2; ++i) {
        promises.push(Ledger.createContract(subcontract));
    }
    try{
    console.log("creating contracts");
    let contracts = await Promise.all(promises);
    let requests = JSON.stringify(contracts.flatMap((owner) => [1, 2, 3].map((token_id) => ({ owner, token_id }))));
    console.info(requests);
    let encodedRequests = TextEncoder.btoa(requests);
    console.info(encodedRequests);
    let request = new Request(`tezos://${fa2Contract}?requests=${encodedRequests}&callback=${displayContract}`)
      console.info(request.url);
      let response = await Contract.call(request);
      console.info(response);
    } catch (error) {
      console.error(error);
      throw(error)
    }
}
async function handler(request: Request): Promise<Response> {
    let url = new URL(request.url);
    await runStuff(url.searchParams.get("fa2_contract"), url.searchParams.get("display_params"));
    return new Response("success");
}

export default handler;
