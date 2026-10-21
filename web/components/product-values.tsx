"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./product-values.preview";
export function StockValues(props:ComponentProps<typeof Preview.StockValues>) {
 const Component=(Preview.StockValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function PriceValues(props:ComponentProps<typeof Preview.PriceValues>) {
 const Component=(Preview.PriceValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function SoldValues(props:ComponentProps<typeof Preview.SoldValues>) {
 const Component=(Preview.SoldValues) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
