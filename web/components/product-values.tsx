"use client";
// Temporary admin rollout; stable version is the previously published interface.
import {useSessionAccess} from "./session-access";
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./product-values.preview";
import * as Stable from "./product-values.stable";
export function StockValues(props:ComponentProps<typeof Preview.StockValues>) {
 const Component=(useSessionAccess().admin?Preview.StockValues:Stable.StockValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function PriceValues(props:ComponentProps<typeof Preview.PriceValues>) {
 const Component=(useSessionAccess().admin?Preview.PriceValues:Stable.PriceValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function SoldValues(props:ComponentProps<typeof Preview.SoldValues>) {
 const Component=(useSessionAccess().admin?Preview.SoldValues:Stable.SoldValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
