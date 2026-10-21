"use client";
// Shared operational interface for authenticated users.
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./dashboard.preview";
export default function Dashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(Preview.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function OrderDetails(props:ComponentProps<typeof Preview.OrderDetails>) {
 const Component=(Preview.OrderDetails) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
