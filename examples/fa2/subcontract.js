export default (request) => {
    console.log("hello from  subcontract");
    const url = new URL(request.url);
    const path = url.pathname;
    switch (path) {
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

                let request = new Request(`tezos://${target}/transfer`, {
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
                console.info(JSON.stringify(body));
                let request = new Request(`tezos://${target}/`, {
                    method: "PUT",
                    body: JSON.stringify(body)
                });
                return Contract.call(request);
            }
    }
}
