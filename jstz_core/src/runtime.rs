use std::{
    cell::RefCell, collections::VecDeque, future::poll_fn, io::Read, rc::Rc, task::Poll,
};

use boa_engine::{
    builtins::promise::PromiseState, context::ContextBuilder, job::NativeJob,
    object::builtins::JsPromise, Context, JsError, JsNativeError, JsResult, JsValue,
    Module, Source,
};

use crate::host;

#[derive(Default)]
struct JobQueue(RefCell<VecDeque<NativeJob>>);

impl JobQueue {
    /// Create an empty `JobQueue`.
    pub fn new() -> Self {
        Self::default()
    }

    fn next(&self) -> Option<NativeJob> {
        self.0.borrow_mut().pop_front()
    }

    pub fn call_next(&self, context: &mut Context<'_>) -> Option<JsResult<JsValue>> {
        let job = self.next()?;
        Some(job.call(context))
    }
}

impl boa_engine::job::JobQueue for JobQueue {
    fn enqueue_promise_job(
        &self,
        job: NativeJob,
        _context: &mut boa_engine::Context<'_>,
    ) {
        self.0.borrow_mut().push_back(job);
    }

    fn enqueue_future_job(
        &self,
        future: boa_engine::job::FutureJob,
        context: &mut boa_engine::Context<'_>,
    ) {
        let job = pollster::block_on(future);
        self.enqueue_promise_job(job, context);
    }

    fn run_jobs(&self, context: &mut boa_engine::Context<'_>) {
        while let Some(job) = self.next() {
            // Jobs can fail, it is the final result that determines the value
            let _ = job.call(context);
        }
    }
}

pub struct Runtime<'host> {
    context: Context<'host>,
    job_queue: Rc<JobQueue>,
}

impl<'host> Runtime<'host> {
    pub fn new() -> Self {
        let job_queue = Rc::new(JobQueue::new());

        // Jstz runtime defines an external job queue and hooks.
        let context = ContextBuilder::new()
            .host_hooks(host::HOOKS)
            .job_queue(job_queue.clone() as Rc<dyn boa_engine::job::JobQueue>)
            .build()
            .unwrap();

        Self { context, job_queue }
    }

    pub fn context(&mut self) -> &mut Context<'host> {
        &mut self.context
    }

    /// Runs the event loop (job queue) to completion
    pub async fn run_event_loop(&mut self) {
        poll_fn(|_| self.poll_event_loop()).await
    }

    /// Runs a single tick of the event loop
    pub fn poll_event_loop(&mut self) -> Poll<()> {
        match self.job_queue.call_next(&mut self.context) {
            None => {
                self.context.clear_kept_objects();
                Poll::Ready(())
            }
            Some(_) => Poll::Pending,
        }
    }

    /// Parses, loads, links and evaluates a module.
    ///
    /// Returns the module instance and the module promise. Implementors must manually
    /// call `Runtime::run_event_loop` or poll/resolve the promise to drive the
    /// module's evaluation.  
    pub fn eval_module(&mut self, module: &Module) -> JsResult<JsPromise> {
        module.load_link_evaluate(&mut self.context)
    }

    /// Parses, compiles and evaluates the script `src`.
    pub fn eval<R: Read>(&mut self, src: Source<'_, R>) -> JsResult<JsValue> {
        self.context.eval(src)
    }

    fn poll_promise(promise: JsPromise) -> Poll<JsResult<JsValue>> {
        match promise.state()? {
            PromiseState::Pending => Poll::Pending,
            PromiseState::Fulfilled(result) => Poll::Ready(Ok(result)),
            PromiseState::Rejected(err) => Poll::Ready(Err(JsError::from_opaque(err))),
        }
    }

    /// Polls a given value to resolve by stepping the event loop
    pub fn poll_value(&mut self, value: &JsValue) -> Poll<JsResult<JsValue>> {
        match value.as_promise() {
            Some(promise) => {
                let promise = JsPromise::from_object(promise.clone())?;
                match Self::poll_promise(promise) {
                    Poll::Ready(val) => Poll::Ready(val),
                    Poll::Pending => match self.poll_event_loop() {
                        Poll::Ready(()) => Poll::Ready(Err(JsNativeError::error()
                            .with_message("Event loop did not resolve the promise")
                            .into())),
                        Poll::Pending => Poll::Pending,
                    },
                }
            }
            None => Poll::Ready(Ok(value.clone())),
        }
    }

    /// Waits for the given value to resolve while polling the event loop
    pub async fn resolve_value(&mut self, value: &JsValue) -> JsResult<JsValue> {
        poll_fn(|_| self.poll_value(value)).await
    }
}
