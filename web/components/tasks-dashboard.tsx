"use client";
// Temporary admin rollout; stable version is the previously published interface.
import {useSessionAccess} from "./session-access";
import type {ComponentProps,ComponentType} from "react";
import * as Preview from "./tasks-dashboard.preview";
import * as Stable from "./tasks-dashboard.stable";
export default function TasksDashboard(props:ComponentProps<typeof Preview.default>) {
 const Component=(useSessionAccess().admin?Preview.default:Stable.default) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function TaskDrawer(props:ComponentProps<typeof Preview.TaskDrawer>) {
 const Component=(useSessionAccess().admin?Preview.TaskDrawer:Stable.TaskDrawer) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function EquipmentTaskProvider(props:ComponentProps<typeof Preview.EquipmentTaskProvider>) {
 const Component=(useSessionAccess().admin?Preview.EquipmentTaskProvider:Stable.EquipmentTaskProvider) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
export function EquipmentTaskLinks(props:ComponentProps<typeof Preview.EquipmentTaskLinks>) {
 const Component=(useSessionAccess().admin?Preview.EquipmentTaskLinks:Stable.EquipmentTaskLinks) as ComponentType<any>;
 return <Component {...(props as any)}/>;
}
