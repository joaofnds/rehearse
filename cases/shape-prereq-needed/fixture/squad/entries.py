import csv


def entry_rows(athletes):
    rows = []
    blocked = []
    for athlete in athletes:
        level = athlete.grade_level()
        if level is None:
            blocked.append(f"{athlete.first_name} {athlete.last_name}: no grade set")
            continue

        rows.append([athlete.last_name, athlete.first_name, athlete.gender, level])
    return rows, blocked


def write_entries(athletes, out):
    rows, blocked = entry_rows(athletes)

    writer = csv.writer(out)
    writer.writerow(["Last", "First", "Gender", "Grade"])
    writer.writerows(rows)
    return blocked
