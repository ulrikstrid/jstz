use boa_engine::{
    object::{FunctionObjectBuilder, ObjectInitializer},
    property::Attribute,
    Context, JsArgs, JsError, JsNativeError, JsResult, JsValue, Module, NativeFunction,
    Source,
};
use boa_gc::{Finalize, Trace};
use jstz_core::host::HostRuntime;

// Contract.call(code)

#[derive(Finalize, Trace)]
struct Contract;

impl Contract {
    fn call(contract_code: String, context: &mut Context<'_>) -> JsResult<JsValue> {
        let module = Module::parse(Source::from_bytes(&contract_code), None, context)?;

        let promise = module.load_link_evaluate(context)?.then(
            Some(
                FunctionObjectBuilder::new(context, unsafe {
                    NativeFunction::from_closure_with_captures(
                        |_, _, module, context| {
                            jstz_core::worker::call_handler(
                                module,
                                &JsValue::undefined(),
                                &[],
                                context,
                            )
                        },
                        module,
                    )
                })
                .build(),
            ),
            None,
            context,
        )?;

        Ok(promise.into())
    }
}

pub struct ContractApi;

impl ContractApi {
    const NAME: &'static str = "Contract";

    fn call(
        _this: &JsValue,
        args: &[JsValue],
        context: &mut Context<'_>,
    ) -> JsResult<JsValue> {
        let contract_code =
            args.get_or_undefined(0)
                .as_string()
                .ok_or_else(|| {
                    JsError::from_native(JsNativeError::typ().with_message(
                        "Failed to convert js value into rust type `String`",
                    ))
                })?
                .to_std_string_escaped();

        Contract::call(contract_code, context)
    }
}

impl jstz_core::host::Api for ContractApi {
    fn init<H: HostRuntime + 'static>(self, context: &mut Context<'_>) {
        let contract = ObjectInitializer::with_native(Contract, context)
            .function(NativeFunction::from_fn_ptr(Self::call), "call", 1)
            .build();

        context
            .register_global_property(Self::NAME, contract, Attribute::all())
            .expect("The contract object shouldn't exist yet")
    }
}
