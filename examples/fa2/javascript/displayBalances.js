function display(response) {
    console.log(`Address ${response.request.owner} has ${response.balance} tokens of type ${response.request.token_id}`);
}
async function handler(request) {
    if (request.method == "POST") {
        let body = await request.json();
        body.forEach(display);
        return new Response("Ok!");
    }
}
export default handler;
