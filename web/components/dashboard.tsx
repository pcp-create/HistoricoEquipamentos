"use client";
// Temporary admin rollout; stable version is the previously published interface.
import {useSessionAccess} from "./session-access";
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./dashboard.preview";
import * as Stable from "./dashboard.stable";
export default function Dashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(useSessionAccess().admin?Preview.default:Stable.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function OrderDetails(props:ComponentProps<typeof Preview.OrderDetails>) {
 const Component=(useSessionAccess().admin?Preview.OrderDetails:Stable.OrderDetails) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
