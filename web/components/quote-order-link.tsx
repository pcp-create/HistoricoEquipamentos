"use client";
import OrderDetailLink from "./order-detail-link";
import CreateLinkedTask from "./create-linked-task";
import type { QuoteSale } from "@/lib/quotes/types";
export default function QuoteOrderLink({ sale }: { sale: QuoteSale }) {
  const number = sale.orderNumber || sale.order;
  return (
    <>
      <OrderDetailLink id={sale.order} company={sale.company} number={number} />
      <CreateLinkedTask
        orderId={sale.order}
        orderCompany={sale.company}
        number={number}
      />
    </>
  );
}
