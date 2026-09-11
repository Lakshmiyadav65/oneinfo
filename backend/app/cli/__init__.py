"""
Command-line entry points.

These exist for the jobs that want a terminal rather than a browser: tuning
a setting against a real file before committing it to .env, or transcribing
something once without starting the server. They import the same providers
the API routes do, so there is one implementation of each pipeline and it
cannot drift from what the app actually runs.
"""
