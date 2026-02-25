import { FAMILY_LABELS, type UseCasePivotRow } from "../types";

interface Props {
  rows: UseCasePivotRow[];
  formatFamilies: string[];
  status: "ready" | "classifying" | "empty";
  onCellClick?: (useCase: string, format: string | null) => void;
}

export default function UseCaseTable({ rows, formatFamilies, status, onCellClick }: Props) {
  if (status === "classifying") {
    return (
      <div className="border border-gray-200 rounded-lg p-8 text-center">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-900 border-t-transparent rounded-full mb-3" />
        <p className="text-gray-700 font-medium text-sm">
          Classifying posts by use case...
        </p>
        <p className="text-gray-400 text-xs mt-1">
          This may take a few seconds.
        </p>
      </div>
    );
  }

  if (status === "empty" || rows.length === 0) {
    return (
      <p className="text-center text-gray-400 py-8 text-sm">
        No posts to classify.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left py-2 pr-4 font-medium text-gray-900">
              Use Case
            </th>
            {formatFamilies.map((f) => (
              <th
                key={f}
                className="text-center py-2 px-3 font-medium text-gray-900"
              >
                {FAMILY_LABELS[f] || f}
              </th>
            ))}
            <th className="text-center py-2 px-3 font-medium text-gray-900">
              Total
            </th>
            <th className="text-center py-2 pl-3 font-medium text-gray-900">
              Best Post
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.use_case}
              className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
            >
              <td className="py-2 pr-4 text-gray-700 capitalize">
                {row.use_case}
              </td>
              {formatFamilies.map((f) => {
                const count = row.counts_by_format[f];
                return (
                  <td
                    key={f}
                    className={`text-center py-2 px-3 ${
                      count
                        ? "text-indigo-600 font-medium cursor-pointer hover:bg-indigo-50 rounded transition-colors"
                        : "text-gray-300"
                    }`}
                    onClick={count && onCellClick ? () => onCellClick(row.use_case, f) : undefined}
                  >
                    {count || "-"}
                  </td>
                );
              })}
              <td
                className={`text-center py-2 px-3 font-medium ${
                  onCellClick ? "text-indigo-600 cursor-pointer hover:bg-indigo-50 rounded transition-colors" : "text-gray-900"
                }`}
                onClick={onCellClick ? () => onCellClick(row.use_case, null) : undefined}
              >
                {row.total}
              </td>
              <td className="text-center py-2 pl-3">
                {row.best_post_url ? (
                  <a
                    href={row.best_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                  >
                    View &rarr;
                  </a>
                ) : (
                  <span className="text-gray-300">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
