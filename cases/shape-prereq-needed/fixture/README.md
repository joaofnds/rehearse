# squad

squad keeps a cross-country team's roster for its coach: the athletes, their grades,
and the file the coach uploads to enter them in a meet.

    python3 -m squad roster     # list the roster with each athlete's grade
    python3 -m squad entries    # write the meet entry file to stdout
    make test

The roster lives in `roster.json`. Athletes reach it two ways. The coach adds them by
hand. Returning athletes were added in August 2026 with the grade copied from last
season's team spreadsheet, and new athletes with the grade they gave on this season's
sign-up form. squad does not record which is which. Or the coach imports the team from
the meet site, which copies each athlete's name, gender and meet-site id, and the grade
of their newest season on the meet site.

What the meet site's own roster import accepts is in `docs/meetsite-roster-import.md`.
