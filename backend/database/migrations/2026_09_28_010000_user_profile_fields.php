<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $cols = [
                'username' => fn () => $table->string('username', 64)->nullable()->after('name'),
                'first_name' => fn () => $table->string('first_name', 80)->nullable()->after('username'),
                'last_name' => fn () => $table->string('last_name', 80)->nullable()->after('first_name'),
                'national_id' => fn () => $table->string('national_id', 20)->nullable()->after('phone'),
                'job' => fn () => $table->string('job', 120)->nullable()->after('national_id'),
                'birth_date' => fn () => $table->date('birth_date')->nullable()->after('job'),
                'landline' => fn () => $table->string('landline', 32)->nullable()->after('birth_date'),
                'bank_name' => fn () => $table->string('bank_name', 120)->nullable()->after('bank_sheba'),
                'bank_account' => fn () => $table->string('bank_account', 64)->nullable()->after('bank_name'),
                'bank_card' => fn () => $table->string('bank_card', 24)->nullable()->after('bank_account'),
            ];
            foreach ($cols as $name => $add) {
                if (! Schema::hasColumn('users', $name)) {
                    $add();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            foreach ([
                'bank_card',
                'bank_account',
                'bank_name',
                'landline',
                'birth_date',
                'job',
                'national_id',
                'last_name',
                'first_name',
                'username',
            ] as $col) {
                if (Schema::hasColumn('users', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
