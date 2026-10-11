import {describe,it,expect,vi} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {BillingHistoryError,formatPaymentAmount} from "./billingHistoryView";
describe("payment history display",()=>{
 it("formats actual paid amount in its actual currency and exponent",()=>{
  expect(formatPaymentAmount(1999,"USD")).toBe("$19.99");expect(formatPaymentAmount(1500,"JPY")).toContain("1,500");expect(formatPaymentAmount(1500,"JPY")).not.toContain("15.00");
 });
 it("explicitly labels legacy records without monetary metadata",()=>{
  expect(formatPaymentAmount(null,null)).toBe("Amount unavailable");expect(formatPaymentAmount(2200,null)).toBe("Amount unavailable");
 });
 it("renders an accessible read failure with retry rather than an empty-history claim",()=>{
  const onRetry=vi.fn(),element=BillingHistoryError({error:"Could not load payment history. Please retry.",onRetry})!;
  const markup=renderToStaticMarkup(element);expect(markup).toContain('role="alert"');expect(markup).toContain("Could not load payment history");expect(markup).toContain("Retry");expect(markup).not.toContain("No payments");
  element.props.children[2].props.onClick();expect(onRetry).toHaveBeenCalledOnce();
 });
});
