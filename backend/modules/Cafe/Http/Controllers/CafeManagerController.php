<?php

namespace Modules\Cafe\Http\Controllers;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Modules\Cafe\Services\CafeManagerService;

/**
 * Manager KPI board. Read-only by design: a manager dashboard must never mutate orders.
 */
class CafeManagerController extends Controller
{
    private const RANGES = ['today', 'week', 'month', 'last7', 'last30'];

    public function __construct(private readonly CafeManagerService $manager) {}

    public function overview(Request $request): \Illuminate\Http\JsonResponse
    {
        $data = $request->validate([
            'range' => ['nullable', 'string', Rule::in(self::RANGES)],
        ]);

        $range = (string) ($data['range'] ?? 'today');

        return response()->json(['data' => $this->manager->overview((int) $request->user()->tenant_id, $range)])
            // Short private cache: several tabs open on one screen should not each hit the DB.
            ->header('Cache-Control', 'private, max-age=45');
    }

    /**
     * The same board as a spreadsheet.
     *
     * A manager compares this week against last week in Excel, and a printed copy is what goes
     * to the owners Monday meeting. The xlsx format returns a real workbook (a zip of SpreadsheetML
     * parts) so it opens without the "this file is corrupt" prompt that a renamed CSV causes;
     * anything else returns CSV for a tool that expects it.
     */
    public function export(Request $request): \Symfony\Component\HttpFoundation\Response
    {
        $data = $request->validate([
            'range' => ['nullable', 'string', Rule::in(self::RANGES)],
            'format' => ['nullable', 'string', Rule::in(['csv', 'xlsx'])],
        ]);

        $range = (string) ($data['range'] ?? 'today');
        $format = (string) ($data['format'] ?? 'csv');
        $overview = $this->manager->overview((int) $request->user()->tenant_id, $range);
        $rows = $this->flatten($overview);
        $filename = 'cafe-report-'.$range.'-'.date('Y-m-d');

        if ($format === 'xlsx') {
            return response((string) $this->xlsx($rows), 200, [
                'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition' => 'attachment; filename="'.$filename.'.xlsx"',
            ]);
        }

        return response($this->csv($rows), 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$filename.'.csv"',
        ]);
    }

    /**
     * Turn the nested overview into label/value rows.
     *
     * One flat table rather than several: a spreadsheet with a section column sorts, filters
     * and pivot-tables without any manual reshaping.
     *
     * @param  array<string, mixed>  $overview
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function flatten(array $overview, string $section = ''): array
    {
        $rows = [];
        foreach ($overview as $key => $value) {
            $label = $section === '' ? (string) $key : $section.'.'.$key;

            if (is_array($value)) {
                // A list of rows (hourly buckets, channels) becomes one line per entry.
                if (array_is_list($value)) {
                    foreach ($value as $entry) {
                        if (is_array($entry)) {
                            $part = [];
                            foreach ($entry as $k => $v) {
                                $part[] = $k.'='.(is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE));
                            }
                            $rows[] = [$label, implode(' | ', $part), ''];
                        } else {
                            $rows[] = [$label, is_scalar($entry) ? (string) $entry : '', ''];
                        }
                    }

                    continue;
                }

                $rows = array_merge($rows, $this->flatten($value, $label));

                continue;
            }

            $rows[] = [$label, is_scalar($value) ? (string) $value : '', ''];
        }

        return $rows;
    }

    /**
     * @param  list<array{0: string, 1: string, 2: string}>  $rows
     */
    private function csv(array $rows): string
    {
        $out = "section,value" . PHP_EOL;
        foreach ($rows as [$label, $value]) {
            // Quote everything and double internal quotes: a channel name with a comma must not
            // shift every later column.
            $safeLabel = str_replace('"', '""', $label);
            $safeValue = str_replace('"', '""', $value);
            $out .= '"' . $safeLabel . '","' . $safeValue . '"' . PHP_EOL;
        }

        return $out;
    }

    /**
     * Minimal but valid .xlsx: six required parts, no styling.
     *
     * Writing this by hand avoids adding a spreadsheet dependency for one report. Excel and
     * LibreOffice both open it; the sheet is named so it survives a multi-tab import.
     *
     * @param  list<array{0: string, 1: string, 2: string}>  $rows
     */
    private function xlsx(array $rows): string
    {
        $escape = static fn (string $v): string => htmlspecialchars($v, ENT_QUOTES | ENT_XML1, 'UTF-8');

        $sheetRows = '';
        $r = 1;
        foreach (array_merge([['بخش', 'مقدار']], array_map(fn ($row) => [$row[0], $row[1]], $rows)) as $row) {
            $cells = '';
            foreach ($row as $index => $value) {
                $col = $index === 0 ? 'A' : 'B';
                $cells .= '<c r="'.$col.$r.'" t="inlineStr"><is><t xml:space="preserve">'
                    .$escape((string) $value).'</t></is></c>';
            }
            $sheetRows .= '<row r="'.$r.'">'.$cells.'</row>';
            $r++;
        }

        $files = [
            '[Content_Types].xml' =>
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
                .'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
                .'<Default Extension="xml" ContentType="application/xml"/>'
                .'<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
                .'<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
                .'</Types>',
            '_rels/.rels' =>
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
                .'</Relationships>',
            'xl/workbook.xml' =>
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                .'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                .'<sheets><sheet name="گزارش" sheetId="1" r:id="rId1"/></sheets></workbook>',
            'xl/_rels/workbook.xml.rels' =>
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                .'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
                .'</Relationships>',
            'xl/worksheets/sheet1.xml' =>
                '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                .'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                .'<sheetData>'.$sheetRows.'</sheetData></worksheet>',
        ];

        // ZipWriter that PHP ships with; no extension beyond the standard zip functions.
        $tmp = tempnam(sys_get_temp_dir(), 'xlsx');
        $zip = new \ZipArchive();
        if ($zip->open($tmp, \ZipArchive::OVERWRITE) !== true) {
            return '';
        }
        foreach ($files as $name => $content) {
            $zip->addFromString($name, $content);
        }
        $zip->close();
        $binary = (string) file_get_contents($tmp);
        @unlink($tmp);

        return $binary;
    }
}
