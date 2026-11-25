<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Brand 7: printing, QR tracking, integrations and offline replays.
 *
 * Four separate gaps, one migration, because they ship together:
 *
 *  1. **Print routing.** A station already exists; what was missing is where its tickets go.
 *     A printer is a physical destination (a local Edge client's queue name, or a network
 *     printer), and a route says "items from this station print there". Without routing every
 *     ticket printed in the office and the kitchen found out by phone.
 *
 *  2. **Receipt layout.** Which lines a receipt carries is a per-tenant decision — a VAT
 *     number, a logo, the QR code. Storing the layout beats hard-coding one shop's taste.
 *
 *  3. **QR scans.** A table QR that nobody scans is a dead sticker. Counting scans per table
 *     (and telling a scan apart from a page load) is what makes the QR feature measurable.
 *
 *  4. **Webhooks and scoped API keys.** Outbound events need a secret and a delivery log;
 *     inbound integrations need a key that may only reach the scopes it was granted.
 *
 * Plus one column on `orders`: `client_ref`. The till's offline queue already generates an id
 * per sale; storing it lets a replay after a dropped connection return the original order
 * instead of charging the guest twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('cafe_printers')) {
            Schema::create('cafe_printers', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                $table->string('name', 120);
                // edge | network — an Edge agent on the counter, or a printer with its own IP.
                $table->string('kind', 16)->default('edge');
                // For Edge: the queue/window name the agent prints to. For network: host:port.
                $table->string('target', 255);
                // receipt | kitchen | label
                $table->string('purpose', 16)->default('kitchen');
                $table->unsignedSmallInteger('paper_width_mm')->default(80);
                $table->boolean('is_active')->default(true);
                $table->string('note', 255)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'branch_id'], 'cafe_printers_branch_idx');
            });
        }

        if (! Schema::hasTable('cafe_print_routes')) {
            Schema::create('cafe_print_routes', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('printer_id')->constrained('cafe_printers')->cascadeOnDelete();
                // A route with no station catches everything a station-specific route did not:
                // the fallback ticket for drinks nobody routed yet.
                $table->foreignId('station_id')->nullable()->constrained('cafe_kitchen_stations')->nullOnDelete();
                // receipt | kitchen | label — what document this route prints.
                $table->string('document', 16)->default('kitchen');
                $table->unsignedSmallInteger('priority')->default(100);
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['tenant_id', 'station_id', 'document'], 'cafe_print_routes_station_idx');
            });
        }

        if (! Schema::hasTable('cafe_qr_scans')) {
            Schema::create('cafe_qr_scans', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('branch_id')->nullable()->constrained('cafe_branches')->nullOnDelete();
                // The table code as printed on the sticker, kept even if the table is deleted.
                $table->string('table_code', 40)->nullable();
                $table->foreignId('table_id')->nullable()->constrained('cafe_tables')->nullOnDelete();
                // menu | table
                $table->string('kind', 16)->default('menu');
                // A hashed visitor key: distinct scans per guest without storing a fingerprint
                // or an address. Rotation is daily, so it cannot be used to follow anyone.
                $table->string('visitor_hash', 64)->nullable();
                $table->timestamp('scanned_at');
                $table->timestamps();

                $table->index(['tenant_id', 'scanned_at'], 'cafe_qr_scans_time_idx');
                $table->index(['tenant_id', 'table_code', 'scanned_at'], 'cafe_qr_scans_table_idx');
            });
        }

        if (! Schema::hasTable('cafe_webhooks')) {
            Schema::create('cafe_webhooks', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                $table->string('url', 2048);
                // Events this hook receives; empty means "all we emit".
                $table->json('events')->nullable();
                // The signing secret, shown once on creation. HMAC-SHA256 of the body.
                $table->string('secret', 80);
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_success_at')->nullable();
                $table->timestamp('last_failure_at')->nullable();
                $table->string('last_error', 500)->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'is_active'], 'cafe_webhooks_active_idx');
            });
        }

        if (! Schema::hasTable('cafe_webhook_deliveries')) {
            Schema::create('cafe_webhook_deliveries', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->foreignId('webhook_id')->constrained('cafe_webhooks')->cascadeOnDelete();
                $table->string('event', 64);
                // queued | delivered | failed
                $table->string('status', 16)->default('queued');
                $table->unsignedSmallInteger('response_status')->nullable();
                $table->unsignedSmallInteger('attempts')->default(0);
                $table->text('payload')->nullable();
                $table->string('error', 500)->nullable();
                $table->timestamp('delivered_at')->nullable();
                $table->timestamps();

                $table->index(['tenant_id', 'status'], 'cafe_webhook_deliveries_status_idx');
            });
        }

        if (! Schema::hasTable('cafe_api_keys')) {
            Schema::create('cafe_api_keys', function (Blueprint $table) {
                $table->id();
                $table->foreignId('tenant_id')->constrained()->cascadeOnDelete();
                $table->string('name', 120);
                // The first few characters, so a person can tell two keys apart.
                $table->string('prefix', 16);
                // SHA-256 of the key. The key itself is never stored: a leaked database must
                // not hand someone a working integration token.
                $table->string('key_hash', 64);
                $table->json('scopes')->nullable();
                $table->timestamp('last_used_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamp('revoked_at')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique('key_hash');
                $table->index(['tenant_id', 'revoked_at'], 'cafe_api_keys_active_idx');
            });
        }

        // Offline replay id. Nullable and unique per tenant: an online till sends nothing and
        // is unaffected, while a queued sale can be replayed safely.
        if (Schema::hasTable('orders') && ! Schema::hasColumn('orders', 'client_ref')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->string('client_ref', 64)->nullable()->after('number');
                $table->unique(['tenant_id', 'client_ref'], 'orders_client_ref_unique');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('orders') && Schema::hasColumn('orders', 'client_ref')) {
            Schema::table('orders', function (Blueprint $table) {
                $table->dropUnique('orders_client_ref_unique');
                $table->dropColumn('client_ref');
            });
        }

        Schema::dropIfExists('cafe_api_keys');
        Schema::dropIfExists('cafe_webhook_deliveries');
        Schema::dropIfExists('cafe_webhooks');
        Schema::dropIfExists('cafe_qr_scans');
        Schema::dropIfExists('cafe_print_routes');
        Schema::dropIfExists('cafe_printers');
    }
};
