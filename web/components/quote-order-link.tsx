"use client";
import OrderDetailLink from "./order-detail-link";
import CreateLinkedTask from "./create-linked-task";
import type { QuoteSale } from "@/lib/quotes/types";
export default function QuoteOrderLink({ sale, showTaskAction = true }: { sale: QuoteSale; showTaskAction?: boolean }) {
  const number = sale.orderNumber || sale.order;
  return (
    <>
      <OrderDetailLink id={sale.order} company={sale.company} number={number} />
      {showTaskAction && <CreateLinkedTask
        orderId={sale.order}
        orderCompany={sale.company}
        number={number}
      />}
    </>
  );
}
