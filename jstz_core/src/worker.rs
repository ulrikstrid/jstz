use std::{io::Read, marker::PhantomData};

use boa_engine::{Context, JsError, JsNativeError, JsResult, JsValue, Module, Source};

use crate::{
    host::{self, Api, Host, HostDefined, HostRuntime},
    host_defined,
    kv::{Kv, Transaction},
    runtime::Runtime,
    Result,
};

/// This struct is an implementation of a `Worker`.
pub struct Worker<'rt, H: HostRuntime + 'static> {
    pub runtime: Runtime<'rt>,
    pub main_module: Module,
    _marker: PhantomData<H>,
}

fn get_default_export(module: &Module, context: &mut Context<'_>) -> JsResult<JsValue> {
    module.namespace(context).get("default", context)
}

pub fn call_handler(
    module: &Module,
    this: &JsValue,
    args: &[JsValue],
    context: &mut Context<'_>,
) -> JsResult<JsValue> {
    let default_export = get_default_export(module, context)?;

    let handler = default_export.as_object().ok_or_else(|| {
        JsError::from_native(
            JsNativeError::typ()
                .with_message("Failed to convert `default` export to js object"),
        )
    })?;

    handler.call(this, args, context)
}

impl<'rt, H: HostRuntime + 'static> Worker<'rt, H> {
    pub fn new<'host, R: Read>(hrt: &'host mut H, src: Source<'_, R>) -> JsResult<Self> {
        let mut runtime = Runtime::new();

        // Initialize the host defined
        let mut host_defined = HostDefined::new();

        host_defined.insert(unsafe { Host::new(hrt) });

        host_defined.init::<H>(runtime.context());

        // Parse module
        let main_module = Module::parse(src, None, runtime.context())?;

        Ok(Self {
            runtime,
            main_module,
            _marker: PhantomData,
        })
    }

    pub fn register_host_api<T>(&mut self, api: T)
    where
        T: host::Api,
    {
        api.init::<H>(self.runtime.context())
    }

    /// Loads, links and evaluates the main module of the worker
    pub async fn eval_main_module(&mut self) -> JsResult<JsValue> {
        let promise = self.runtime.eval_module(&self.main_module)?;

        self.runtime.resolve_value(&promise.into()).await
    }

    /// Runs the worker's handler with `this` and `args`.
    ///
    /// # Note
    ///
    /// This must only be called if the `main_module` has been evaluated using `Worker::eval_main_module`.
    pub async fn run(
        &mut self,
        this: &JsValue,
        args: &[JsValue],
    ) -> Result<Option<JsValue>> {
        // Register `Kv` and `Transaction` objects in `HostDefined`
        {
            host_defined!(&mut self.runtime.context(), mut host_defined);

            let kv = Kv::new();
            let tx = kv.begin_transaction();

            host_defined.insert(kv);
            host_defined.insert(tx);
        }

        // Call the function from the `main_module`
        let result = call_handler(&self.main_module, this, args, self.runtime.context())?;

        // Resolve the value
        let result = self.runtime.resolve_value(&result).await?;

        // Commit transaction
        let committed = {
            host_defined!(&mut self.runtime.context(), mut host_defined);

            let mut rt = host_defined
                .remove::<Host<H>>()
                .expect("Rust type `Host` should be defined in `HostDefined`");

            let mut kv = host_defined
                .remove::<Kv>()
                .expect("Rust type `Kv` should be defined in `HostDefined`");

            let tx = host_defined
                .remove::<Transaction>()
                .expect("Rust type `Transaction` should be defined in `HostDefined`");

            kv.commit_transaction(&mut *rt, *tx)?
        };

        Ok(if committed { Some(result) } else { None })
    }
}
