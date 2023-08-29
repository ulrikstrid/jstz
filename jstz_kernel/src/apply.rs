use std::{
    future::Future,
    sync::Arc,
    task::{Context, Poll, Wake, Waker},
};

use boa_engine::{JsValue, Source};
use jstz_core::{kv::Kv, worker::Worker};
use jstz_ledger::account::Account;
use tezos_smart_rollup::prelude::{debug_msg, Runtime};

use crate::inbox::{Deposit, Transaction};

pub fn apply_deposit(rt: &mut impl Runtime, deposit: Deposit) {
    let Deposit { amount, reciever } = deposit;

    let mut kv = Kv::new();
    let mut tx = kv.begin_transaction();

    Account::deposit(rt, &mut tx, &reciever, amount).expect("Failed to deposit");

    kv.commit_transaction(rt, tx)
        .expect("Failed to commit transaction for deposit");
}

struct Signal;

impl Wake for Signal {
    fn wake(self: Arc<Self>) {}
}

fn block_on<F: Future>(mut fut: F) -> F::Output {
    let mut fut = unsafe { std::pin::Pin::new_unchecked(&mut fut) };

    let waker = Waker::from(Arc::new(Signal));
    let mut context = Context::from_waker(&waker);

    loop {
        match fut.as_mut().poll(&mut context) {
            Poll::Pending => (),
            Poll::Ready(item) => break item,
        }
    }
}

pub fn apply_transaction(rt: &mut (impl Runtime + 'static), tx: Transaction) {
    let Transaction {
        contract_address,
        contract_code,
    } = tx;

    debug_msg!(rt, "Evaluating: {contract_code:?}\n");

    // Initialize runtime
    let mut jstz_worker = Worker::new(rt, Source::from_bytes(&contract_code))
        .expect("Failed to initialize `Worker`");
    jstz_worker.register_host_api(jstz_api::ConsoleApi);
    jstz_worker.register_host_api(jstz_api::LedgerApi { contract_address });
    jstz_worker.register_host_api(jstz_api::ContractApi);

    // Evaluate main module
    block_on(jstz_worker.eval_main_module()).expect("Failed to evaluate `Worker` module");

    // Eval
    let res = block_on(jstz_worker.run(&JsValue::undefined(), &[]));

    debug_msg!(rt, "Result: {res:?}\n");
}
