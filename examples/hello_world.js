const handler = async () => {
    console.log("Hello JS 👋")

    await Contract.call(`
const handler = () => {
    console.log("Hello from sub contract call 👋")
}

export default handler;
`);
}

export default handler;