import {reportFooterHtml} from '@/lib/reports/html-footer';
export default function ReportBrandFooter({title}:{title:string}){
 return <div className="report-print-brand" dangerouslySetInnerHTML={{__html:reportFooterHtml(title)}}/>;
}
