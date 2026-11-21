# Database backups

`scripts/backup_db.sh` dumps the `oxblood` database to `/DATA/Backups/oxblood`
(override with `BACKUP_DIR`), verifies the dump, and keeps 14 days.

Run once by hand:

    scripts/backup_db.sh

Schedule it nightly with systemd:

    sudo cp deploy/backup/oxblood-backup.{service,timer} /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now oxblood-backup.timer
    systemctl list-timers oxblood-backup.timer

Restore into a database (stop the API first):

    gunzip -c /DATA/Backups/oxblood/<file>.sql.gz | docker exec -i oxblood-postgres psql -U oxblood -d oxblood

Test a restore on a throwaway Postgres container before you need it.
