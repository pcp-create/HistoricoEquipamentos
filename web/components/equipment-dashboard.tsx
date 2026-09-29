"use client";
// Temporary admin rollout; stable version is the previously published interface.
import {useSessionAccess} from "./session-access";
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./equipment-dashboard.preview";
import * as Stable from "./equipment-dashboard.stable";
export default function EquipmentDashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(useSessionAccess().admin?Preview.default:Stable.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
