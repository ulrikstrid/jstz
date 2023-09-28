const subcontract = `
function handler (request) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
    switch (path) {
        case ("/ping"):
                console.log("Hello from  subcontract 👋");
                return new Response("Pong!");
        case ("/transfer"):
            {
                let to = url.searchParams.get("to_address");
                let token_id = +url.searchParams.get("token_id");
                let amount = +url.searchParams.get("amount");
                let target = url.searchParams.get("fa2_contract");
                let transfers = [{
                    from: Ledger.selfAddress(),
                    transfers: [{ to, token_id, amount }]
                }];

                let request = new Request(\`tezos://\${target}/transfer\`, {
                    method: "POST",
                    body: JSON.stringify(transfers)
                });
                console.info(request.url);
                return Contract.call(request);
            }
        case ("/add_operator"):
            {
                let target = url.searchParams.get("fa2_contract");
                let tokens = JSON.parse(url.searchParams.get("tokens"));
                let operator = request.headers.get("Referer");
                let owner = Ledger.selfAddress();
                let body = tokens.map((token_id)=>({
                   operation: "add_operator",
                   owner, operator, token_id
                }));
                return Contract.call(
                new Request(\`tezos://\${target}/update_operators\`, {
                    method: "PUT",
                    body: JSON.stringify(body)
                }));
            }
    }
    } catch (error) {
        console.error(error);
        return Response.error();
    }
}
export default handler;
`;
async function handler () {
    let fa2Contract = "tz4Ehy39DcvT4YQcebEpXpLQTH8B4eA31CJs";
    let address = Ledger.createContract(subcontract)
    let result = await Contract.call(new Request(`tezos://${address}/add_operator?fa2_contract=${fa2Contract}&tokens=${tokens}`));
    return result
}
