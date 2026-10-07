[SAMPLE WRITEUP - replace with your own: content/writeups/crackme-keygen.md]

# crackme: keygenme_01

Category: reversing | Difficulty: easy | Date: 2026-08-30
Tools: Ghidra, file, strings, python3

This is a sample writeup for a fictional crackme, written to show the intended style. Replace it with your own.

## TL;DR

A console crackme asks for a username and a serial. Static analysis in Ghidra shows the check derives a value from the username and compares it against the serial after a simple transform. We recover the algorithm and write a Python keygen that produces a valid serial for any username.

## Recon

```
$ file keygenme_01
keygenme_01: ELF 64-bit LSB pie executable, x86-64, dynamically linked, not stripped
```

Not stripped, which means Ghidra will give us real function names. Run it to see the interface:

```
$ ./keygenme_01
username: alice
serial: 1234-5678
[-] wrong serial, try again
```

A quick strings pass shows the prompts and the success/failure messages, plus a hint that the serial is checked in blocks:

```
$ strings keygenme_01 | grep -iE 'serial|wrong|correct|%'
username: 
serial: 
[+] correct! nice work
[-] wrong serial, try again
%04x-%04x
```

The "%04x-%04x" format string is a strong hint: the serial is two 16-bit hex groups separated by a dash.

## Static analysis in Ghidra

Load the binary and jump to main. The interesting logic is in check_serial. Cleaned-up decompilation:

```c
int check_serial(char *user, char *serial) {
    unsigned int h = 0x1505;          // seed
    for (int i = 0; user[i] != '\0'; i++) {
        h = (h * 33) + (unsigned char)user[i];
    }
    h = h & 0xffffffff;

    unsigned short a = (unsigned short)(h & 0xffff);
    unsigned short b = (unsigned short)((h >> 16) & 0xffff);
    b = b ^ 0x1337;                   // the one twist

    unsigned int ua, ub;
    if (sscanf(serial, "%04x-%04x", &ua, &ub) != 2)
        return 0;

    return (ua == a) && (ub == b);
}
```

Reading it top to bottom:

- The seed 0x1505 and the "h = h * 33 + c" step are the djb2 string hash. Recognizing common algorithms saves a lot of time - this is a textbook pattern.
- The 32-bit hash is split into two 16-bit halves: the low half a and the high half b.
- The high half is XORed with the constant 0x1337. That is the only non-obvious step, and it is easy to miss if you skim.
- The serial must parse as "%04x-%04x" into (ua, ub), and both halves must match.

So a valid serial is simply the low and high halves of djb2(username), with the high half XORed by 0x1337, printed as "%04x-%04x".

## Confirming the seed and constant

Double-check the constants in the disassembly rather than trusting the decompiler:

```
mov    eax, 0x1505        ; seed
...
imul   eax, eax, 0x21     ; 0x21 = 33 -> djb2
...
xor    eax, 0x1337        ; applied to the high half
```

0x21 is 33 and 0x1505 is the djb2 seed, matching the decompilation. The XOR of 0x1337 is right there too. Good.

## Writing the keygen

Port the algorithm straight to Python:

```python
#!/usr/bin/env python3
import sys

def djb2(s: str) -> int:
    h = 0x1505
    for c in s.encode():
        h = (h * 33 + c) & 0xffffffff
    return h

def keygen(user: str) -> str:
    h = djb2(user)
    a = h & 0xffff
    b = ((h >> 16) & 0xffff) ^ 0x1337
    return "%04x-%04x" % (a, b)

if __name__ == "__main__":
    user = sys.argv[1] if len(sys.argv) > 1 else input("username: ")
    print(keygen(user))
```

Generate a serial and test it against the binary:

```
$ python3 keygen.py alice
<low>-<high>

$ ./keygenme_01
username: alice
serial: <low>-<high>
[+] correct! nice work
```

The keygen works for any username because we reproduce the exact check instead of hunting for one hardcoded serial.

## Notes and pitfalls

- Char signedness: in C, "char" may be signed. Here the code casts to unsigned char before adding, so Python's unsigned bytes match. If the target added a signed char, bytes >= 0x80 would subtract, and the keygen would need to mirror that.
- Width masking: keep the hash masked to 32 bits each iteration so overflow behavior matches the C unsigned int.
- sscanf parsing: "%04x" sets a minimum field width for printing but sscanf still accepts the hex value; the compare is numeric, so leading zeros in the serial do not matter to the check, only to the expected format.
- Always verify constants in the disassembly. Decompilers occasionally mislabel a magic number or fold a step.

## Lessons learned

- Recognizing standard algorithms (djb2 here) turns "reverse this blob" into "confirm the two constants."
- The whole difficulty of an easy keygenme is usually one small twist - here, the XOR on the high half. Read every line; do not skim.
- A real keygen reproduces the check, so it works for any input. That is the difference between cracking one serial and understanding the scheme.
