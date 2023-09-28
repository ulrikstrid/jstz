export function isAddress(addr) {
    return typeof (addr) === 'string';
}
function isArray(check, list) {
    return Array.isArray(list) && list.reduce((acc, item) => acc && check(item), true);
}
export function isTokenId(id) {
    return typeof (id) === 'number' && Number.isInteger(id);
}
export function isTransfer(argument) {
    let transfer = argument;
    try {
        return isAddress(transfer.to) &&
            isTokenId(transfer.token_id) &&
            Number.isInteger(transfer.amount);
    }
    catch {
        return false;
    }
}
export function isTransfers(argument) {
    let transfers = argument;
    try {
        return isAddress(transfers.from) && isArray(isTransfer, transfers.transfers);
    }
    catch {
        return false;
    }
}
export function isUpdateOperator(argument) {
    let update = argument;
    try {
        return (update.operation === "add_operator" || update.operation === "remove_operator") &&
            isAddress(update.owner) && isAddress(update.operator) && isTokenId(update.token_id);
    }
    catch {
        return false;
    }
}
export function isBalanceRequest(argument) {
    let request = argument;
    try {
        return isAddress(request.owner) &&
            isTokenId(request.token_id);
    }
    catch {
        return false;
    }
}
export function isBalanceOf(argument) {
    let balanceOf = argument;
    try {
        return isAddress(balanceOf.callback) && isArray(isBalanceRequest, balanceOf.requests);
    }
    catch {
        return false;
    }
}
export function isBalanceResponse(argument) {
    let balanceResponse = argument;
    try {
        return isBalanceRequest(balanceResponse.request) && Number.isInteger(balanceResponse.balance);
    }
    catch {
        return false;
    }
}
export function isMintNew(argument) {
    let mintNew = argument;
    try {
        return isTokenId(mintNew.token_id) && isAddress(mintNew.owner) && Number.isInteger(mintNew.amount);
    }
    catch {
        return false;
    }
}
function registerKey(tokenId) {
    return `token/${tokenId}`;
}
function registerToken(tokenId) {
    Kv.set(registerKey(tokenId), true);
}
function assertRegistered(tokenId) {
    if (!Kv.get(registerKey(tokenId))) {
        throw "FA2_TOKEN_UNDEFINED";
    }
}
function balanceKey(user, tokenId) {
    return `balance/${user}/${tokenId}`;
}
function getBalance(user, tokenId) {
    return Kv.get(balanceKey(user, tokenId)) || 0;
}
function setBalance(user, tokenId, newBalance) {
    if (newBalance < 0) {
        throw "FA2_INSUFFICIENT_BALANCE";
    }
    Kv.set(balanceKey(user, tokenId), newBalance);
}
function changeBalance(user, tokenId, amount) {
    const oldBalance = getBalance(user, tokenId);
    setBalance(user, tokenId, oldBalance + amount);
}
function transferTokens(from, to, tokenId, amount) {
    changeBalance(from, tokenId, -amount);
    changeBalance(to, tokenId, amount);
}
function operatorKey(owner, operator, token_id) {
    return `owner/${owner}/${operator}/${token_id}`;
}
function setOperator(owner, operator, token_id) {
    Kv.set(operatorKey(owner, operator, token_id), true);
}
function unsetOperator(owner, operator, token_id) {
    Kv.delete(operatorKey(owner, operator, token_id));
}
function assertOperator(owner, operator, token_id) {
    if (!(owner === operator || Kv.get(operatorKey(owner, operator, token_id)))) {
        throw "FA2_NOT_OPERATOR";
    }
}
function assertOwner(owner, referer) {
    if (owner !== referer) {
        console.log(`${owner} != ${referer}`);
        throw "FA2_NOT_OWNER";
    }
}
function performTransfer(from, operator, transfer) {
    assertRegistered(transfer.token_id);
    assertOperator(from, operator, transfer.token_id);
    transferTokens(from, transfer.to, transfer.token_id, transfer.amount);
}
function performTransfers(referer, transfers) {
    transfers.forEach((group) => group.transfers.forEach((transfer) => performTransfer(group.from, referer, transfer)));
}
function performUpdateOperator(referer, update) {
    switch (update.operation) {
        case "add_operator":
            assertOwner(update.owner, referer);
            setOperator(update.owner, update.operator, update.token_id);
            break;
        case "remove_operator":
            assertOperator(update.owner, referer, update.token_id);
            unsetOperator(update.owner, update.operator, update.token_id);
    }
}
function forEachUnique(ts, f) {
    let seen = {};
    let output = [];
    ts.forEach((t) => {
        let key = JSON.stringify(t);
        if (!seen[key]) {
            seen[key] = true;
            output.push(f(t));
            f(t);
        }
    });
    return output;
}
function performBalanceRequest(request) {
    const balance = getBalance(request.owner, request.token_id);
    return { request, balance };
}
async function performBalanceOf(balanceOf) {
    let responses = forEachUnique(balanceOf.requests, performBalanceRequest);
    const request = new Request(`tezos://${balanceOf.callback}`, {
        method: "POST",
        body: JSON.stringify(responses)
    });
    let _ = Contract.call(request);
    return responses;
}
function performMintNew(mintNew) {
    registerToken(mintNew.token_id);
    changeBalance(mintNew.owner, mintNew.token_id, mintNew.amount);
}
async function handler(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
        switch (path) {
            case "/ping":
                console.log("Hello from runner contract 👋");
                return new Response("Pong");
            case "/balance_of":
                if (request.method === "GET") {
                    let balanceOf = {
                        requests: JSON.parse(TextEncoder.atob(url.searchParams.get("requests"))),
                        callback: url.searchParams.get("callback")
                    };
                    if (isBalanceOf(balanceOf)) {
                        let responses = await performBalanceOf(balanceOf);
                        return Response.json(responses);
                    }
                    else {
                        console.error("Invalid parameters", balanceOf);
                        return Response.error();
                    }
                }
                else {
                    const error = "/balance_of is a GET request";
                    console.error(error);
                    return new Response(error, { status: 500 });
                }
            case "/transfer":
                if (request.method === "POST") {
                    let transfers = await request.json();
                    if (isArray(isTransfers, transfers)) {
                        performTransfers(request.headers.get("Referer"), transfers);
                        return new Response("Success!");
                    }
                    else {
                        console.error("Invalid parameters", JSON.stringify(transfers));
                        return Response.error();
                    }
                }
                else {
                    const error = "/transfer is a POST request";
                    console.error(error);
                    return new Response(error, { status: 500 });
                }
            case "/mint_new":
                if (request.method === "POST") {
                    let mint = await request.json();
                    if (isArray(isMintNew, mint)) {
                        // TODO not anybody should be allowed to do this
                        mint.forEach(performMintNew);
                        return new Response("Success!");
                    }
                    else {
                        console.error("Invalid parameters", JSON.stringify(mint));
                        return Response.error();
                    }
                }
                else {
                    const error = "/mint_new is a POST request";
                    console.error(error);
                    return new Response(error, { status: 500 });
                }
            case "/update_operators":
                if (request.method === "PUT") {
                    let updates = await request.json();
                    if (isArray(isUpdateOperator, updates)) {
                        updates.forEach((update) => performUpdateOperator(request.headers.get("Referer"), update));
                        return new Response("Success!");
                    }
                    else {
                        console.error("Invalid parameters", JSON.stringify(updates));
                        return Response.error();
                    }
                }
                else {
                    const error = "/update_operators is a PUT request";
                    console.error(error);
                    return new Response(error, { status: 500 });
                }
            default:
                const error = `Unrecognised entrypoint ${path}`;
                console.error(error);
                return new Response(error, { status: 404 });
        }
    }
    catch (error) {
        console.error(error);
        throw error;
    }
}
export default handler;
