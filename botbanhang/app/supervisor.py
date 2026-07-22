import asyncio
import contextlib
import logging
import os
import sys

from .kho_client import KhoClient

logging.basicConfig(level=logging.INFO,format="%(asctime)s %(levelname)s %(message)s")


async def main() -> None:
    client=KhoClient()
    processes:dict[int,asyncio.subprocess.Process]={}
    try:
        while True:
            try:
                wanted={int(shop["shop_id"]) for shop in await client.shops()}
                for shop_id in wanted:
                    process=processes.get(shop_id)
                    if process is None or process.returncode is not None:
                        env=os.environ.copy();env["BOT_SHOP_ID"]=str(shop_id)
                        processes[shop_id]=await asyncio.create_subprocess_exec(sys.executable,"-m","app.main",env=env)
                        logging.info("Đã khởi động runtime riêng cho shop %s",shop_id)
                for shop_id in set(processes)-wanted:
                    processes[shop_id].terminate();await processes[shop_id].wait();del processes[shop_id]
            except Exception:
                logging.exception("Không thể đồng bộ danh sách shop bot")
            await asyncio.sleep(3)
    finally:
        for process in processes.values():
            if process.returncode is None:process.terminate()
        for process in processes.values():
            with contextlib.suppress(Exception):await process.wait()
        await client.close()


if __name__=="__main__":
    asyncio.run(main())
