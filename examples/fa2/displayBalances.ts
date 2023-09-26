import {BalanceResponse} from "./fa2"
function display(response: BalanceResponse) {
    console.log(`Address ${response.request.owner} has ${response.balance} tokens of type ${response.request.token_id}`);
}
async function handler(request : Request) {
    if(request.method == "POST") {
        let body : BalanceResponse [] = await request.json();
        body.forEach(display);
        return new Response("Ok!")
    }
}
export default handler;
